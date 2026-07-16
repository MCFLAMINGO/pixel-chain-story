/**
 * Lock Feeder — live foreign value → Worldlight.
 *
 * Wires what was missing: a real lock receipt, not a typed string.
 *
 *   Ethereum USDC  → PixelUsdcLock (Solidity) / LocalUsdcRail (executable here)
 *   Bank wire      → BankWireAttestor (hash-OTS signed claim)
 *        ↓
 *   LockReceipt (verified)
 *        ↓
 *   prepareIngress / illuminateIngress → PIX on Personal Source
 *
 * Double-lock replay is rejected via consumed digests.
 */

import {
  generateLightKeypair,
  sha512Hex,
  signLightFull,
  verifyLightFull,
  bytesToHex,
  randomBytes,
  type Hex,
  type LightKeypair,
} from "./crypto";
import {
  digestForeignLock,
  prepareIngress,
  type ForeignValueLock,
  type PreparedIngress,
} from "./worldlight";

export type LockVenue = "ethereum" | "bank_wire";

export interface LockReceipt {
  version: 1;
  venue: LockVenue;
  asset: "USDC" | "USD";
  /** Human units (5 = five dollars) */
  amount: number;
  /** Raw on-chain units for USDC (6 decimals) or cents for USD wire */
  amountRaw: string;
  foreignRef: string;
  lockDigest: Hex;
  /** Pixel Personal Source that will receive PIX */
  pixelRecipient: string;
  locker: string;
  /** Chain id or "bank" */
  chainId: string;
  lockedAt: number;
  /** Opaque proof — event encoding or bank attestation sig */
  proof: string;
  salt: Hex;
}

export interface FeederState {
  /** Digests already fed into Pixel shine-in */
  consumed: Set<string>;
}

export function createFeederState(): FeederState {
  return { consumed: new Set() };
}

// ─── Local USDC rail (same semantics as PixelUsdcLock.sol) ─────────────

export interface LocalUsdcRail {
  contractId: string;
  chainId: string;
  balances: Map<string, number>; // raw 6-decimal
  lockedRaw: number;
  locks: Array<{
    lockId: number;
    locker: string;
    amountRaw: number;
    pixelRecipient: string;
    salt: Hex;
    lockDigest: Hex;
    lockedAt: number;
  }>;
  nextId: number;
  usedSalts: Set<string>;
}

export function createLocalUsdcRail(opts?: { chainId?: string }): LocalUsdcRail {
  return {
    contractId: "local:PixelUsdcLock",
    chainId: opts?.chainId ?? "pixel-local-1",
    balances: new Map(),
    lockedRaw: 0,
    locks: [],
    nextId: 0,
    usedSalts: new Set(),
  };
}

/** Mint test USDC to an EOA-like id (6 decimals). */
export function mintLocalUsdc(rail: LocalUsdcRail, account: string, humanUsd: number): void {
  const raw = Math.round(humanUsd * 1e6);
  rail.balances.set(account, (rail.balances.get(account) ?? 0) + raw);
}

/**
 * Lock USDC on the local rail — mirrors PixelUsdcLock.lock().
 * This is the executable feeder CI runs; Solidity is the EVM twin.
 */
export async function lockUsdcOnRail(params: {
  rail: LocalUsdcRail;
  locker: string;
  humanUsd: number;
  pixelRecipient: string;
  salt?: Hex;
}): Promise<LockReceipt> {
  if (!params.pixelRecipient.startsWith("pix1")) {
    throw new Error("USDC lock requires pix1 Personal Source recipient");
  }
  const amountRaw = Math.round(params.humanUsd * 1e6);
  if (amountRaw <= 0) throw new Error("amount");
  const bal = params.rail.balances.get(params.locker) ?? 0;
  if (bal < amountRaw) throw new Error("insufficient USDC");

  const salt = params.salt ?? bytesToHex(randomBytes(32));
  if (params.rail.usedSalts.has(salt)) throw new Error("salt used");
  params.rail.usedSalts.add(salt);

  params.rail.balances.set(params.locker, bal - amountRaw);
  params.rail.lockedRaw += amountRaw;
  const lockId = ++params.rail.nextId;

  const lockDigest = await sha512Hex(
    [
      "pixel-usdc-lock-v1",
      params.rail.contractId,
      String(lockId),
      params.locker,
      String(amountRaw),
      params.pixelRecipient,
      salt,
      params.rail.chainId,
    ].join("|"),
  );

  const lockedAt = Date.now();
  params.rail.locks.push({
    lockId,
    locker: params.locker,
    amountRaw,
    pixelRecipient: params.pixelRecipient,
    salt,
    lockDigest,
    lockedAt,
  });

  const proof = await sha512Hex(
    `Locked|${lockId}|${params.locker}|${amountRaw}|${params.pixelRecipient}|${salt}|${lockDigest}`,
  );

  return {
    version: 1,
    venue: "ethereum",
    asset: "USDC",
    amount: params.humanUsd,
    amountRaw: String(amountRaw),
    foreignRef: `${params.rail.contractId}:${lockId}`,
    lockDigest,
    pixelRecipient: params.pixelRecipient,
    locker: params.locker,
    chainId: params.rail.chainId,
    lockedAt,
    proof,
    salt,
  };
}

/** Re-verify a local USDC receipt against rail state (relayer honesty check). */
export async function verifyUsdcReceipt(
  rail: LocalUsdcRail,
  receipt: LockReceipt,
): Promise<{ ok: boolean; reason?: string }> {
  if (receipt.venue !== "ethereum" || receipt.asset !== "USDC") {
    return { ok: false, reason: "not usdc ethereum receipt" };
  }
  const row = rail.locks.find((l) => `${rail.contractId}:${l.lockId}` === receipt.foreignRef);
  if (!row) return { ok: false, reason: "lock not found on rail" };
  if (row.lockDigest !== receipt.lockDigest) return { ok: false, reason: "digest mismatch" };
  if (row.pixelRecipient !== receipt.pixelRecipient) {
    return { ok: false, reason: "recipient mismatch" };
  }
  if (String(row.amountRaw) !== receipt.amountRaw) return { ok: false, reason: "amount mismatch" };
  const expect = await sha512Hex(
    [
      "pixel-usdc-lock-v1",
      rail.contractId,
      String(row.lockId),
      row.locker,
      String(row.amountRaw),
      row.pixelRecipient,
      row.salt,
      rail.chainId,
    ].join("|"),
  );
  if (expect !== receipt.lockDigest) return { ok: false, reason: "digest rebuild failed" };
  return { ok: true };
}

// ─── Bank wire attestor ────────────────────────────────────────────────

export interface BankWireAttestor {
  /** Attestor key — signs “we received this wire”; does not hold user Pixel keys */
  key: LightKeypair;
  institutionId: string;
  seenRefs: Set<string>;
}

export async function createBankWireAttestor(
  institutionId = "mcflamingo-correspondent",
): Promise<BankWireAttestor> {
  return {
    key: await generateLightKeypair(),
    institutionId,
    seenRefs: new Set(),
  };
}

/**
 * Attest a received USD wire bound to a Pixel Personal Source.
 * Production: bank/core-banking webhook → this attestation.
 */
export async function attestBankWire(params: {
  attestor: BankWireAttestor;
  humanUsd: number;
  pixelRecipient: string;
  wireRef: string;
}): Promise<LockReceipt> {
  if (!params.pixelRecipient.startsWith("pix1")) {
    throw new Error("Wire attestation requires pix1 recipient");
  }
  if (params.attestor.seenRefs.has(params.wireRef)) {
    throw new Error("wire ref already attested");
  }
  params.attestor.seenRefs.add(params.wireRef);

  const amountRaw = String(Math.round(params.humanUsd * 100)); // cents
  const salt = bytesToHex(randomBytes(16));
  const body = [
    "pixel-bank-wire-v1",
    params.attestor.institutionId,
    params.wireRef,
    amountRaw,
    params.pixelRecipient,
    salt,
  ].join("|");
  const lockDigest = await sha512Hex(body);
  const signature = await signLightFull(body, params.attestor.key);

  return {
    version: 1,
    venue: "bank_wire",
    asset: "USD",
    amount: params.humanUsd,
    amountRaw,
    foreignRef: params.wireRef,
    lockDigest,
    pixelRecipient: params.pixelRecipient,
    locker: params.attestor.institutionId,
    chainId: "bank",
    lockedAt: Date.now(),
    proof: signature,
    salt,
  };
}

export async function verifyBankWireReceipt(
  attestor: BankWireAttestor,
  receipt: LockReceipt,
): Promise<{ ok: boolean; reason?: string }> {
  if (receipt.venue !== "bank_wire" || receipt.asset !== "USD") {
    return { ok: false, reason: "not bank wire" };
  }
  const body = [
    "pixel-bank-wire-v1",
    attestor.institutionId,
    receipt.foreignRef,
    receipt.amountRaw,
    receipt.pixelRecipient,
    receipt.salt,
  ].join("|");
  const digest = await sha512Hex(body);
  if (digest !== receipt.lockDigest) return { ok: false, reason: "digest" };
  const sigOk = await verifyLightFull(body, receipt.proof, attestor.key.publicKey);
  if (!sigOk) return { ok: false, reason: "bad attestor signature" };
  return { ok: true };
}

// ─── Feed into Worldlight ──────────────────────────────────────────────

export async function receiptToForeignLock(receipt: LockReceipt): Promise<ForeignValueLock> {
  return {
    asset: receipt.asset,
    amount: receipt.amount,
    venue: receipt.venue === "ethereum" ? "ethereum" : "bank_wire",
    foreignRef: receipt.foreignRef,
    lockDigest: receipt.lockDigest,
  };
}

/**
 * Verify receipt, reject replays, build PreparedIngress for shine-in.
 * Call `consumeLockReceipt` only after illuminate succeeds.
 */
export async function feedLockToWorldlight(params: {
  receipt: LockReceipt;
  ownerLocalId: string;
  feeder: FeederState;
  /** Rail verification for USDC */
  rail?: LocalUsdcRail;
  /** Bank verification */
  attestor?: BankWireAttestor;
}): Promise<PreparedIngress> {
  const { receipt, feeder } = params;
  if (feeder.consumed.has(receipt.lockDigest)) {
    throw new Error("lock already consumed — no double shine-in");
  }
  if (!receipt.pixelRecipient.startsWith("pix1")) {
    throw new Error("receipt recipient must be Personal Source");
  }

  if (receipt.venue === "ethereum") {
    if (!params.rail) throw new Error("USDC feed needs rail");
    const v = await verifyUsdcReceipt(params.rail, receipt);
    if (!v.ok) throw new Error(`USDC receipt invalid: ${v.reason}`);
  } else {
    if (!params.attestor) throw new Error("bank feed needs attestor");
    const v = await verifyBankWireReceipt(params.attestor, receipt);
    if (!v.ok) throw new Error(`Wire receipt invalid: ${v.reason}`);
  }

  const valueLock = await receiptToForeignLock(receipt);
  // Ensure Worldlight composite digest is well-formed
  await digestForeignLock(valueLock);

  return prepareIngress({
    kind: "usd_value",
    name: `$${receipt.amount} ${receipt.asset} via ${receipt.venue}`,
    ownerAddress: receipt.pixelRecipient,
    ownerLocalId: params.ownerLocalId,
    valueLock,
  });
}

/** After successful illuminate — prevent double shine-in of the same lock. */
export function consumeLockReceipt(feeder: FeederState, lockDigest: Hex): void {
  feeder.consumed.add(lockDigest);
}

export const LockFeeder = {
  createState: createFeederState,
  createRail: createLocalUsdcRail,
  mintUsdc: mintLocalUsdc,
  lockUsdc: lockUsdcOnRail,
  verifyUsdc: verifyUsdcReceipt,
  createBankAttestor: createBankWireAttestor,
  attestWire: attestBankWire,
  verifyWire: verifyBankWireReceipt,
  feed: feedLockToWorldlight,
  consume: consumeLockReceipt,
} as const;

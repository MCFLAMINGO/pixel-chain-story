/**
 * People wallet — browser hold of a Personal Source without CLI init.
 *
 * Pay face (public): address + label. Vault seed is PIN-wrapped (AES-GCM)
 * and never rests plaintext in localStorage. Never render vault as pay UI.
 *
 * Lab Kindling still uses optical vault paths elsewhere; /wallet requires PIN.
 * OTS nextLeaf persists so spent leaves stay burned (PATH Gate H).
 */

import { forgePersonalSource, type PersonalSource, type UnlockedSource } from "./custody";
import { hexToBytes, restoreLightKeypair, type Hex } from "./crypto";
import type { OpticalPattern } from "./optical";
import {
  assertPin,
  pinWrapThesis,
  unwrapSeedWithPin,
  wrapSeedWithPin,
  type PinWrappedSeed,
} from "./people-wallet-seal";
import { attachTransferViaRpc, tipMarkSummary, type TipMarkReceipt } from "./tip-mark";

export const PEOPLE_WALLET_STORAGE_KEY = "pixel.people.wallet.v1";

/** What strangers / pay UI may see — never includes vault cells. */
export type PayFace = {
  address: string;
  publicKey: string;
  localId: string;
};

/** PIN-sealed device hold (v2). */
export type PeopleWalletBlobV2 = {
  v: 2;
  address: string;
  publicKey: Hex;
  localId: string;
  wrapped: PinWrappedSeed;
  createdAt: number;
  nextLeaf?: number;
};

/** Legacy plaintext vault blob — refuse unlock; clear + re-forge with PIN. */
export type PeopleWalletBlobV1 = {
  v: 1;
  source: PersonalSource;
  createdAt: number;
  nextLeaf?: number;
};

export type PeopleWalletBlob = PeopleWalletBlobV2 | PeopleWalletBlobV1;

export function toPayFace(source: {
  address: string;
  publicKey: string;
  localId: string;
}): PayFace {
  return {
    address: source.address,
    publicKey: source.publicKey,
    localId: source.localId,
  };
}

export function isPinSealedBlob(blob: PeopleWalletBlob | null): blob is PeopleWalletBlobV2 {
  return !!blob && blob.v === 2 && !!blob.wrapped;
}

export function loadPeopleWalletBlob(): PeopleWalletBlob | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PEOPLE_WALLET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PeopleWalletBlob;
    if (parsed?.v === 2) {
      if (!parsed.address || !parsed.wrapped?.ciphertext) return null;
      return parsed;
    }
    if (parsed?.v === 1) {
      if (!parsed.source?.address) return null;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function savePeopleWalletBlob(blob: PeopleWalletBlob): void {
  if (typeof localStorage === "undefined") {
    throw new Error("People wallet needs a browser (localStorage)");
  }
  localStorage.setItem(PEOPLE_WALLET_STORAGE_KEY, JSON.stringify(blob));
}

export function clearPeopleWalletBlob(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(PEOPLE_WALLET_STORAGE_KEY);
}

export function payFaceFromBlob(blob: PeopleWalletBlob): PayFace {
  if (blob.v === 2) {
    return { address: blob.address, publicKey: blob.publicKey, localId: blob.localId };
  }
  return toPayFace(blob.source);
}

/** Persist OTS leaf cursor after a successful sign. */
export function persistPeopleWalletLeaf(nextLeaf: number): boolean {
  const blob = loadPeopleWalletBlob();
  if (!blob) return false;
  if (!Number.isInteger(nextLeaf) || nextLeaf < 0) {
    throw new Error(`Invalid nextLeaf ${nextLeaf}`);
  }
  savePeopleWalletBlob({ ...blob, nextLeaf });
  return true;
}

/**
 * Forge once, PIN-wrap seed, persist ciphertext only (no plaintext vault on disk).
 */
export async function forgeAndPersistPeopleWallet(
  localId: string,
  pin: string,
): Promise<{ payFace: PayFace; unlocked: UnlockedSource }> {
  const p = assertPin(pin);
  const { unlocked } = await forgePersonalSource(localId.trim() || "you");
  const seedHex = unlocked.keypair.seed;
  if (!seedHex) throw new Error("forge missing seed");
  const seed = hexToBytes(seedHex);
  const wrapped = await wrapSeedWithPin(seed, p);
  const blob: PeopleWalletBlobV2 = {
    v: 2,
    address: unlocked.keypair.address,
    publicKey: unlocked.keypair.publicKey,
    localId: unlocked.localId,
    wrapped,
    createdAt: Date.now(),
    nextLeaf: unlocked.keypair.nextLeaf,
  };
  savePeopleWalletBlob(blob);
  return {
    payFace: {
      address: blob.address,
      publicKey: blob.publicKey,
      localId: blob.localId,
    },
    unlocked,
  };
}

/**
 * Unlock with PIN only — no simulated optical capture on /wallet.
 */
export async function unlockStoredPeopleWallet(
  pin: string,
): Promise<{ payFace: PayFace; unlocked: UnlockedSource } | null> {
  const blob = loadPeopleWalletBlob();
  if (!blob) return null;
  if (blob.v !== 2) {
    throw new Error("Old wallet (no PIN). Clear device hold, then create again with a PIN.");
  }
  const p = assertPin(pin);
  const seed = await unwrapSeedWithPin(blob.wrapped, p);
  const keypair = await restoreLightKeypair(seed, blob.nextLeaf ?? 0);
  if (keypair.address !== blob.address) {
    throw new Error("Unwrapped Source does not match pay face");
  }
  return {
    payFace: {
      address: blob.address,
      publicKey: blob.publicKey,
      localId: blob.localId,
    },
    unlocked: { keypair, localId: blob.localId },
  };
}

/** Fetch PIX balance from a tip RPC (node REST). */
export async function fetchTipBalance(
  rpc: string,
  address: string,
): Promise<{ amount: number; tipIndex?: number } | null> {
  const base = rpc.replace(/\/$/, "");
  try {
    const balRes = await fetch(`${base}/balance/${encodeURIComponent(address)}`);
    if (!balRes.ok) return null;
    const bal = (await balRes.json()) as { amount?: number; balance?: number };
    const amount = Number(bal.amount ?? bal.balance ?? 0);
    let tipIndex: number | undefined;
    try {
      const health = (await fetch(`${base}/health`).then((r) => r.json())) as {
        tip?: number;
        pixels?: number;
      };
      tipIndex =
        typeof health.tip === "number"
          ? health.tip
          : typeof health.pixels === "number"
            ? health.pixels - 1
            : undefined;
    } catch {
      /* optional */
    }
    return { amount: Number.isFinite(amount) ? amount : 0, tipIndex };
  } catch {
    return null;
  }
}

/** Claim tip faucet PIX for a new pay face (PIXEL_FAUCET / PIXEL_BRIDGE_LAB on tip). */
export async function claimTipFaucet(params: {
  rpc: string;
  address: string;
  amount?: number;
}): Promise<{
  funded: number;
  balance: number;
  tipIndex: number;
  skipped: boolean;
  summary: string;
}> {
  const base = params.rpc.replace(/\/$/, "");
  const res = await fetch(`${base}/faucet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: params.address, amount: params.amount ?? 10 }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    funded?: number;
    balance?: number;
    tipIndex?: number;
    skipped?: boolean;
    summary?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `faucet HTTP ${res.status}`);
  }
  return {
    funded: Number(data.funded ?? 0),
    balance: Number(data.balance ?? 0),
    tipIndex: Number(data.tipIndex ?? 0),
    skipped: Boolean(data.skipped),
    summary: String(data.summary ?? "funded"),
  };
}

/**
 * Pay from unlocked Source onto the shared tip (POST /tx → tip inclusion).
 */
export async function payOnSharedTip(params: {
  rpc: string;
  unlocked: UnlockedSource;
  toAddress: string;
  amount: number;
  note?: string;
}): Promise<{ tipMark: TipMarkReceipt; summary: string }> {
  const to = params.toAddress.trim();
  if (!to.startsWith("pix")) throw new Error("Pay needs a Pixel address (pix…)");
  const { tipMark } = await attachTransferViaRpc({
    rpcBase: params.rpc,
    from: params.unlocked.keypair,
    toAddress: to,
    amount: params.amount,
    kind: "people-pay",
    metadata: {
      description: params.note?.trim() || `People pay · ${params.unlocked.localId}`,
      recipientLabel: to.slice(0, 12),
      reference: `PAY-${Date.now().toString(36)}`,
    },
  });
  persistPeopleWalletLeaf(params.unlocked.keypair.nextLeaf);
  return {
    tipMark,
    summary: tipMarkSummary(tipMark),
  };
}

export function peopleWalletThesis(): string {
  return (
    "People wallet: hold a Personal Source without CLI init; pay face shows address only; " +
    "vault is PIN-wrapped on device (AES-GCM) and is never the pay UI. Balance is read from a shared tip " +
    "RPC when connected; pay posts a tip mark on that picture — not a private notebook. " +
    "OTS nextLeaf persists across unlock so spent leaves stay burned. " +
    pinWrapThesis()
  );
}

/** Type guard for vault shape (tests / import). */
export function isOpticalVault(v: unknown): v is OpticalPattern {
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray((v as OpticalPattern).cells) &&
    typeof (v as OpticalPattern).checksum === "string"
  );
}

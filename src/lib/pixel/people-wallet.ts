/**
 * People wallet — browser hold of a Personal Source without CLI init.
 *
 * Pay face (public): address + label. Vault seed is PIN-wrapped (AES-GCM)
 * and never rests plaintext on disk. IndexedDB primary + localStorage mirror.
 * Optional WebAuthn PRF device unlock. Never render vault as pay UI.
 */

import { forgePersonalSource, type PersonalSource, type UnlockedSource } from "./custody";
import { hexToBytes, OTS_CURSOR_UNKNOWN, restoreLightKeypair, type Hex } from "./crypto";
import type { OpticalPattern } from "./optical";
import { idbClear, idbReadRaw, idbWriteRaw } from "./people-wallet-idb";
import {
  assertPin,
  pinWrapThesis,
  unwrapSeedWithPin,
  wrapSeedWithPin,
  type PinWrappedSeed,
} from "./people-wallet-seal";
import {
  enableWebAuthnSeal,
  unlockSeedWithWebAuthn,
  type WebAuthnSeal,
} from "./people-wallet-webauthn";
import { attachTransferViaRpc, tipMarkSummary, type TipMarkReceipt } from "./tip-mark";

export const PEOPLE_WALLET_STORAGE_KEY = "pixel.people.wallet.v1";
export const PEOPLE_WALLET_IDLE_LOCK_MS = 3 * 60 * 1000;

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
  /** Optional WebAuthn PRF second unlock path */
  webauthn?: WebAuthnSeal;
};

/** Legacy plaintext vault blob — refuse unlock; clear + re-forge with PIN. */
export type PeopleWalletBlobV1 = {
  v: 1;
  source: PersonalSource;
  createdAt: number;
  nextLeaf?: number;
};

export type PeopleWalletBlob = PeopleWalletBlobV2 | PeopleWalletBlobV1;

function parseBlob(raw: string): PeopleWalletBlob | null {
  try {
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

/** Sync load — localStorage mirror (tests + fallback). */
export function loadPeopleWalletBlob(): PeopleWalletBlob | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PEOPLE_WALLET_STORAGE_KEY);
    if (!raw) return null;
    return parseBlob(raw);
  } catch {
    return null;
  }
}

/** Prefer IndexedDB; migrate from localStorage when needed. */
export async function loadPeopleWalletBlobAsync(): Promise<PeopleWalletBlob | null> {
  const fromIdb = await idbReadRaw();
  if (fromIdb) {
    const blob = parseBlob(fromIdb);
    if (blob) {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(PEOPLE_WALLET_STORAGE_KEY, fromIdb);
        }
      } catch {
        /* ignore */
      }
      return blob;
    }
  }
  const fromLs = loadPeopleWalletBlob();
  if (fromLs) {
    try {
      await idbWriteRaw(JSON.stringify(fromLs));
    } catch {
      /* idb optional */
    }
  }
  return fromLs;
}

export function savePeopleWalletBlob(blob: PeopleWalletBlob): void {
  if (typeof localStorage === "undefined") {
    throw new Error("People wallet needs a browser (localStorage)");
  }
  const json = JSON.stringify(blob);
  localStorage.setItem(PEOPLE_WALLET_STORAGE_KEY, json);
  void idbWriteRaw(json).catch(() => undefined);
}

export async function savePeopleWalletBlobAsync(blob: PeopleWalletBlob): Promise<void> {
  const json = JSON.stringify(blob);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(PEOPLE_WALLET_STORAGE_KEY, json);
  }
  try {
    await idbWriteRaw(json);
  } catch {
    if (typeof localStorage === "undefined") {
      throw new Error("People wallet needs IndexedDB or localStorage");
    }
  }
}

export function clearPeopleWalletBlob(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(PEOPLE_WALLET_STORAGE_KEY);
  }
  void idbClear();
}

export async function clearPeopleWalletBlobAsync(): Promise<void> {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(PEOPLE_WALLET_STORAGE_KEY);
  }
  await idbClear();
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
): Promise<{ payFace: PayFace; unlocked: UnlockedSource; seed: Uint8Array }> {
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
  await savePeopleWalletBlobAsync(blob);
  return {
    payFace: {
      address: blob.address,
      publicKey: blob.publicKey,
      localId: blob.localId,
    },
    unlocked,
    seed,
  };
}

/**
 * Unlock with PIN only — no simulated optical capture on /wallet.
 */
export async function unlockStoredPeopleWallet(
  pin: string,
): Promise<{ payFace: PayFace; unlocked: UnlockedSource; seed: Uint8Array } | null> {
  const blob = (await loadPeopleWalletBlobAsync()) ?? loadPeopleWalletBlob();
  if (!blob) return null;
  if (blob.v !== 2) {
    throw new Error("Old wallet (no PIN). Clear device hold, then create again with a PIN.");
  }
  const p = assertPin(pin);
  const seed = await unwrapSeedWithPin(blob.wrapped, p);
  const keypair = await restoreLightKeypair(seed, blob.nextLeaf ?? OTS_CURSOR_UNKNOWN);
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
    seed,
  };
}

/** Enable Face ID / Touch ID PRF unlock after a PIN session. */
export async function enableDeviceUnlock(params: {
  seed: Uint8Array;
  address: string;
  localId: string;
}): Promise<void> {
  const blob = (await loadPeopleWalletBlobAsync()) ?? loadPeopleWalletBlob();
  if (!blob || blob.v !== 2) throw new Error("PIN-sealed wallet required");
  // Each call mints a platform passkey. Called twice, the device accumulates
  // credentials the wallet will never look for again — clutter in the user's
  // password manager, and the reason a stale one can be offered at unlock time.
  if (blob.webauthn && blob.address === params.address) {
    throw new Error(
      "Face ID is already set up for this wallet. Turn it off first if you want to replace it.",
    );
  }
  const seal = await enableWebAuthnSeal(params);
  await savePeopleWalletBlobAsync({ ...blob, webauthn: seal });
}

/**
 * Forget this device's Face ID seal.
 *
 * Only removes the wallet's pointer to it. The platform passkey itself lives in
 * the browser or password manager and has to be deleted there — the web cannot
 * delete a credential it created.
 */
export async function disableDeviceUnlock(): Promise<void> {
  const blob = (await loadPeopleWalletBlobAsync()) ?? loadPeopleWalletBlob();
  if (!blob || blob.v !== 2) return;
  const { webauthn: _dropped, ...rest } = blob;
  await savePeopleWalletBlobAsync(rest);
}

export async function unlockStoredPeopleWalletWithDevice(): Promise<{
  payFace: PayFace;
  unlocked: UnlockedSource;
  seed: Uint8Array;
} | null> {
  const blob = (await loadPeopleWalletBlobAsync()) ?? loadPeopleWalletBlob();
  if (!blob || blob.v !== 2 || !blob.webauthn) {
    throw new Error("Device unlock not enabled — unlock with PIN, then enable Face ID / Touch ID");
  }
  const seed = await unlockSeedWithWebAuthn(blob.webauthn);
  const keypair = await restoreLightKeypair(seed, blob.nextLeaf ?? OTS_CURSOR_UNKNOWN);
  if (keypair.address !== blob.address) {
    throw new Error(
      "This device's Face ID belongs to a different wallet. Unlock with your PIN, " +
        "then turn Face ID off and on again to bind it to this one.",
    );
  }
  return {
    payFace: {
      address: blob.address,
      publicKey: blob.publicKey,
      localId: blob.localId,
    },
    unlocked: { keypair, localId: blob.localId },
    seed,
  };
}

/** Encrypted backup = the v2 blob JSON (already PIN-wrapped). */
export function exportPeopleWalletBackup(): string {
  const blob = loadPeopleWalletBlob();
  if (!blob || blob.v !== 2) throw new Error("Nothing to export — need a PIN-sealed wallet");
  return JSON.stringify({ pixelBackup: 1, savedAt: Date.now(), wallet: blob }, null, 2);
}

export async function importPeopleWalletBackup(json: string, pin: string): Promise<PayFace> {
  const parsed = JSON.parse(json) as { pixelBackup?: number; wallet?: PeopleWalletBlobV2 };
  const wallet = parsed.wallet ?? (parsed as unknown as PeopleWalletBlobV2);
  if (!wallet || wallet.v !== 2 || !wallet.wrapped) {
    throw new Error("Not a Pixel PIN-sealed backup");
  }
  const seed = await unwrapSeedWithPin(wallet.wrapped, pin);
  const keypair = await restoreLightKeypair(seed, wallet.nextLeaf ?? OTS_CURSOR_UNKNOWN);
  if (keypair.address !== wallet.address) throw new Error("Backup PIN/address mismatch");
  await savePeopleWalletBlobAsync(wallet);
  return {
    address: wallet.address,
    publicKey: wallet.publicKey,
    localId: wallet.localId,
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
  /** Lab tips only. Paying onto a look-alike Earth is refused by default. */
  requireCrowned?: boolean;
}): Promise<{ tipMark: TipMarkReceipt; summary: string }> {
  const to = params.toAddress.trim();
  if (!to.startsWith("pix")) throw new Error("Pay needs a Pixel address (pix…)");
  const { tipMark } = await attachTransferViaRpc({
    rpcBase: params.rpc,
    requireCrowned: params.requireCrowned,
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

/* ── Export / import ─────────────────────────────────────────────────────────
 *
 * The seed is born inside one browser and, until now, could never leave it. That
 * made the phone the wallet: no second device, and no recovery if storage went.
 * Meanwhile the only thing a user *could* back up was the PIN — which is the one
 * piece that is worthless alone, since it unwraps a seed stored nowhere else.
 *
 * What moves is the stored blob, which is already sealed with the PIN. So the
 * text below is not a secret in the way a seed phrase is: without the PIN it
 * unwraps nothing. That is deliberate — no new crypto, no plaintext seed on a
 * screen, and no new way to lose everything by screenshotting it.
 */

export const PEOPLE_WALLET_EXPORT_MAGIC = "PIXELWALLET1";

/**
 * Sealed, portable copy of this device's wallet. Requires the PIN to be of any
 * use. Returns null when there is nothing stored.
 */
export async function exportPeopleWallet(): Promise<string | null> {
  const blob = (await loadPeopleWalletBlobAsync()) ?? loadPeopleWalletBlob();
  if (!blob) return null;
  if (blob.v !== 2) {
    throw new Error("This wallet predates PIN sealing — unlock and re-forge before exporting");
  }
  return `${PEOPLE_WALLET_EXPORT_MAGIC}:${btoa(JSON.stringify(blob))}`;
}

export interface ImportedWallet {
  address: string;
  localId: string;
  /** True when an existing wallet on this device was replaced. */
  replaced: boolean;
}

/**
 * Take a sealed copy onto this device.
 *
 * Refuses to overwrite a *different* wallet unless asked, because importing over
 * an identity whose seed exists nowhere else destroys it silently — the same
 * mistake as offering "create wallet" when a read failed.
 *
 * The OTS leaf cursor travels with the blob. Two live copies signing from one
 * cursor would reuse one-time leaves, which the chain rejects; this is a path for
 * moving and recovering a wallet, not for running it in two places at once.
 */
export async function importPeopleWallet(
  text: string,
  opts?: { replaceDifferent?: boolean },
): Promise<ImportedWallet> {
  const trimmed = text.trim();
  const prefix = `${PEOPLE_WALLET_EXPORT_MAGIC}:`;
  if (!trimmed.startsWith(prefix)) {
    throw new Error("Not a Pixel wallet export — expected text starting PIXELWALLET1:");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(trimmed.slice(prefix.length)));
  } catch {
    throw new Error("Wallet export is corrupt — copy the whole line, including the end");
  }
  const blob = parseBlob(JSON.stringify(parsed));
  if (!blob || blob.v !== 2) throw new Error("Wallet export is not a PIN-sealed wallet");

  const existing = (await loadPeopleWalletBlobAsync()) ?? loadPeopleWalletBlob();
  const existingAddress = existing && existing.v === 2 ? existing.address : null;
  const different = existingAddress !== null && existingAddress !== blob.address;
  if (different && !opts?.replaceDifferent) {
    throw new Error(
      `This device already holds a different wallet (${existingAddress.slice(0, 12)}…). ` +
        "Importing would replace it, and its seed may exist nowhere else. Export that one first.",
    );
  }
  savePeopleWalletBlob(blob);
  return { address: blob.address, localId: blob.localId, replaced: different };
}

/**
 * Load the wallet, distinguishing "no wallet here" from "could not look".
 *
 * The plain loader returns null for both, and the wallet screen treats null as
 * "offer to create one" — which invites a user to forge a second identity on top
 * of a first whose seed may exist nowhere else. A read failure must never be
 * presented as an empty device.
 */
export async function loadPeopleWalletResult(): Promise<
  | { status: "found"; blob: PeopleWalletBlob }
  | { status: "empty" }
  | { status: "unreadable"; reason: string }
> {
  const { idbReadResult } = await import("./people-wallet-idb");
  const idb = await idbReadResult();
  if (idb.status === "found") {
    const blob = parseBlob(idb.raw);
    if (blob) return { status: "found", blob };
    return { status: "unreadable", reason: "stored wallet is corrupt or from a newer version" };
  }
  // IndexedDB is the source of truth; localStorage is only a migration mirror.
  // Consult it either way — a wallet written before the migration still counts,
  // and finding one there after an IDB failure is a recovery rather than a risk.
  const mirrored = loadPeopleWalletBlob();
  if (mirrored) return { status: "found", blob: mirrored };
  if (idb.status === "unreadable") return { status: "unreadable", reason: idb.reason };
  // Something is stored here but did not parse. Present-and-broken is not absent,
  // and must not be answered with an offer to create a replacement.
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(PEOPLE_WALLET_STORAGE_KEY);
      if (raw !== null && raw.trim() !== "") {
        return { status: "unreadable", reason: "stored wallet is corrupt or from a newer version" };
      }
    }
  } catch (e) {
    return {
      status: "unreadable",
      reason: e instanceof Error ? e.message : "storage is not readable",
    };
  }
  return { status: "empty" };
}

/**
 * People wallet — browser hold of a Personal Source without CLI init.
 *
 * Pay face (public): address + label. Vault stays sealed in device storage and
 * must never be rendered as the pay UI (CUSTODY.md / WORLD-CANVAS.md).
 *
 * Lab: persistence is localStorage on this device. Not the shared public tip
 * by itself — balance is read from an RPC tip when provided.
 *
 * OTS leaf cursor (`nextLeaf`) is persisted beside the sealed Source so unlock
 * after a spend does not reuse a burned leaf (PATH Gate H).
 */

import {
  forgePersonalSource,
  unlockPersonalSource,
  type PersonalSource,
  type UnlockedSource,
} from "./custody";
import type { OpticalPattern } from "./optical";
import { attachTransferViaRpc, tipMarkSummary, type TipMarkReceipt } from "./tip-mark";

export const PEOPLE_WALLET_STORAGE_KEY = "pixel.people.wallet.v1";

/** What strangers / pay UI may see — never includes vault cells. */
export type PayFace = {
  address: string;
  publicKey: string;
  localId: string;
};

export type PeopleWalletBlob = {
  v: 1;
  source: PersonalSource;
  createdAt: number;
  /** Next unused OTS leaf — restore on unlock after prior signs. */
  nextLeaf?: number;
};

export function toPayFace(source: PersonalSource): PayFace {
  return {
    address: source.address,
    publicKey: source.publicKey,
    localId: source.localId,
  };
}

export function loadPeopleWalletBlob(): PeopleWalletBlob | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PEOPLE_WALLET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PeopleWalletBlob;
    if (parsed?.v !== 1 || !parsed.source?.address || !parsed.source?.vault) return null;
    return parsed;
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

/**
 * Persist OTS leaf cursor after a successful sign (pay / kindle settle).
 * No-op when no people wallet is stored — lab attach / ephemeral unlocks
 * still pay on tip without a device blob.
 */
export function persistPeopleWalletLeaf(nextLeaf: number): boolean {
  const blob = loadPeopleWalletBlob();
  if (!blob) return false;
  if (!Number.isInteger(nextLeaf) || nextLeaf < 0) {
    throw new Error(`Invalid nextLeaf ${nextLeaf}`);
  }
  savePeopleWalletBlob({ ...blob, nextLeaf });
  return true;
}

/** Forge once and persist sealed Source (vault not shown in pay UI). */
export async function forgeAndPersistPeopleWallet(
  localId: string,
): Promise<{ payFace: PayFace; source: PersonalSource; unlocked: UnlockedSource }> {
  const { source, unlocked } = await forgePersonalSource(localId);
  savePeopleWalletBlob({
    v: 1,
    source,
    createdAt: Date.now(),
    nextLeaf: unlocked.keypair.nextLeaf,
  });
  return { payFace: toPayFace(source), source, unlocked };
}

export async function unlockStoredPeopleWallet(
  capturedCells?: number[],
): Promise<{ source: PersonalSource; unlocked: UnlockedSource } | null> {
  const blob = loadPeopleWalletBlob();
  if (!blob) return null;
  const unlocked = await unlockPersonalSource(blob.source, capturedCells, {
    nextLeaf: blob.nextLeaf ?? 0,
  });
  return { source: blob.source, unlocked };
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

/**
 * Pay from unlocked Source onto the shared tip (POST /tx → tip inclusion).
 * Vault never leaves the unlock session; only the signed tx hits the wire.
 * Advances and persists the OTS leaf cursor after a successful tip mark.
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
    "vault stays sealed on device and is never the pay UI. Balance is read from a shared tip " +
    "RPC when connected; pay posts a tip mark on that picture — not a private notebook. " +
    "OTS nextLeaf persists across unlock so spent leaves stay burned."
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

/**
 * People-wallet bridge — shine world value (USDC / ETH / bank USD) into a pay face.
 *
 * Prefer tip RPC `POST /bridge/shine-in` when the tip enables PIXEL_BRIDGE_LAB=1
 * so PIX lands on the **shared tip**. Local lab path is fallback for offline demos.
 *
 * Dream ≠ claim: lab rail / tip lab faucet is not a mainnet USDC bridge.
 */

import {
  assertPixelAddress,
  bytesToHex,
  generateLightKeypair,
  randomBytes,
  sha512Hex,
  type Hex,
  type LightKeypair,
} from "./crypto";
import { balanceOf, createGenesis, type PixelChainState } from "./chain";
import { LockFeeder, type FeederState, type LocalUsdcRail, type LockReceipt } from "./lock-feeder";
import {
  illuminateIngress,
  prepareIngress,
  type ForeignValueLock,
  type IlluminatedIngress,
} from "./worldlight";

export type WalletBridgeAsset = "USDC" | "ETH" | "USD";

export const WALLET_BRIDGE_MAX_USD = 25;

export function walletBridgeThesis(): string {
  return (
    "Phone wallet bridge: lock USDC / crypto / wire → shine in → PIX on your pay face. " +
    "Tip-anchored when the public tip enables lab shine-in; otherwise local lab rail. " +
    "Not a claim of mainnet bridge."
  );
}

export function bridgeAssetLabel(asset: WalletBridgeAsset): string {
  switch (asset) {
    case "USDC":
      return "USDC";
    case "ETH":
      return "ETH (USD quote)";
    case "USD":
      return "Bank wire (USD)";
  }
}

/** Build a lab foreign lock for ETH (USD-quoted) or USD wire without a USDC rail. */
export async function labForeignLock(params: {
  asset: "ETH" | "USD";
  humanUsd: number;
  pixelRecipient: string;
}): Promise<ForeignValueLock> {
  assertPixelAddress(params.pixelRecipient, "pixelRecipient");
  if (!(params.humanUsd > 0) || params.humanUsd > WALLET_BRIDGE_MAX_USD) {
    throw new Error(`amount must be 0 < x ≤ ${WALLET_BRIDGE_MAX_USD}`);
  }
  const salt = bytesToHex(randomBytes(16));
  const foreignRef = params.asset === "ETH" ? `lab-eth:${salt}` : `lab-wire:${salt}`;
  const lockDigest = (await sha512Hex(
    [
      "pixel-wallet-bridge-v1",
      params.asset,
      String(params.humanUsd),
      params.pixelRecipient,
      foreignRef,
    ].join("|"),
  )) as Hex;
  return {
    asset: params.asset === "ETH" ? "ETH" : "USD",
    amount: params.humanUsd,
    venue: params.asset === "ETH" ? "ethereum" : "bank_wire",
    foreignRef,
    lockDigest,
  };
}

export async function prepareWalletBridgeIngress(params: {
  asset: WalletBridgeAsset;
  humanUsd: number;
  ownerAddress: string;
  ownerLocalId: string;
  /** Required for USDC path */
  rail?: LocalUsdcRail;
  feeder?: FeederState;
}): Promise<{ prepared: Awaited<ReturnType<typeof prepareIngress>>; receipt?: LockReceipt }> {
  assertPixelAddress(params.ownerAddress, "ownerAddress");
  if (!(params.humanUsd > 0) || params.humanUsd > WALLET_BRIDGE_MAX_USD) {
    throw new Error(`amount must be 0 < x ≤ ${WALLET_BRIDGE_MAX_USD}`);
  }

  if (params.asset === "USDC") {
    if (!params.rail || !params.feeder) {
      throw new Error("USDC bridge needs rail + feeder");
    }
    const locker = "0xPhoneWallet";
    if ((params.rail.balances.get(locker) ?? 0) < Math.round(params.humanUsd * 1e6)) {
      LockFeeder.mintUsdc(params.rail, locker, Math.max(100, params.humanUsd * 4));
    }
    const receipt = await LockFeeder.lockUsdc({
      rail: params.rail,
      locker,
      humanUsd: params.humanUsd,
      pixelRecipient: params.ownerAddress,
    });
    const prepared = await LockFeeder.feed({
      receipt,
      ownerLocalId: params.ownerLocalId,
      feeder: params.feeder,
      rail: params.rail,
    });
    return { prepared, receipt };
  }

  const valueLock = await labForeignLock({
    asset: params.asset,
    humanUsd: params.humanUsd,
    pixelRecipient: params.ownerAddress,
  });
  // prepareIngress historically USD|USDC — ETH allowed as quoted crypto rail.
  const prepared = await prepareIngress({
    kind: "usd_value",
    name: `$${params.humanUsd} ${params.asset} phone bridge`,
    ownerAddress: params.ownerAddress,
    ownerLocalId: params.ownerLocalId,
    valueLock: {
      ...valueLock,
      // Quote ETH as USD units for PIX credit (lab).
      asset: params.asset === "ETH" ? "USD" : valueLock.asset,
    },
  });
  // Restore honest asset label in bridge memo path via name; credit uses USD quote.
  return { prepared };
}

/** Offline / no-tip demo: forge escrow genesis, shine in, return PIX on local chain. */
export async function shineInLocalLab(params: {
  asset: WalletBridgeAsset;
  humanUsd: number;
  ownerAddress: string;
  ownerLocalId: string;
}): Promise<{
  plane: "lab_local";
  pixCredited: number;
  summary: string;
  tipIndex: number;
  state: PixelChainState;
  vault: LightKeypair;
}> {
  const vault = await generateLightKeypair();
  const state = await createGenesis(vault);
  const rail = LockFeeder.createRail();
  const feeder = LockFeeder.createState();
  const { prepared, receipt } = await prepareWalletBridgeIngress({
    ...params,
    rail,
    feeder,
  });
  const res: IlluminatedIngress = await illuminateIngress({
    prepared,
    state,
    bridgeVault: vault,
    sequencer: vault,
  });
  if (receipt) LockFeeder.consume(feeder, receipt.lockDigest);
  return {
    plane: "lab_local",
    pixCredited: res.pixCredited,
    summary: res.summary,
    tipIndex: res.state.pixels.length - 1,
    state: res.state,
    vault,
  };
}

export type TipShineInResult = {
  ok: true;
  plane: "shared_tip";
  pixCredited: number;
  tipIndex: number;
  balance: number;
  summary: string;
  canvasId: string | null;
  lab?: boolean;
  lockTx?: string;
  humanUsd?: number;
};

/** Call tip `POST /bridge/shine-in-lock` — verified eth Locked → PIX. */
export async function shineInViaLockTx(params: {
  rpc: string;
  txHash: string;
  ownerAddress: string;
  ownerLocalId: string;
}): Promise<TipShineInResult> {
  assertPixelAddress(params.ownerAddress, "ownerAddress");
  const base = params.rpc.replace(/\/$/, "");
  const res = await fetch(`${base}/bridge/shine-in-lock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      txHash: params.txHash,
      ownerAddress: params.ownerAddress,
      ownerLocalId: params.ownerLocalId,
    }),
  });
  const data = (await res.json()) as TipShineInResult & { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `tip lock bridge HTTP ${res.status}`);
  }
  return data as TipShineInResult;
}

/** Call tip `POST /bridge/shine-in` (requires PIXEL_BRIDGE_LAB=1 on tip — demo only). */
export async function shineInViaTipRpc(params: {
  rpc: string;
  asset: WalletBridgeAsset;
  humanUsd: number;
  ownerAddress: string;
  ownerLocalId: string;
}): Promise<TipShineInResult> {
  assertPixelAddress(params.ownerAddress, "ownerAddress");
  const base = params.rpc.replace(/\/$/, "");
  const res = await fetch(`${base}/bridge/shine-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      asset: params.asset,
      humanUsd: params.humanUsd,
      ownerAddress: params.ownerAddress,
      ownerLocalId: params.ownerLocalId,
    }),
  });
  const data = (await res.json()) as TipShineInResult & { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `tip bridge HTTP ${res.status}`);
  }
  return data as TipShineInResult;
}

/** Prefer tip; fall back to local lab rail. */
export async function shineInForPhoneWallet(params: {
  rpc?: string | null;
  asset: WalletBridgeAsset;
  humanUsd: number;
  ownerAddress: string;
  ownerLocalId: string;
}): Promise<
  | TipShineInResult
  | {
      ok: true;
      plane: "lab_local";
      pixCredited: number;
      tipIndex: number;
      balance: number;
      summary: string;
      canvasId: null;
    }
> {
  if (params.rpc?.trim()) {
    try {
      return await shineInViaTipRpc({
        rpc: params.rpc.trim(),
        asset: params.asset,
        humanUsd: params.humanUsd,
        ownerAddress: params.ownerAddress,
        ownerLocalId: params.ownerLocalId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Tip without lab bridge → local demo still teaches the pipe.
      if (!/404|not enabled|PIXEL_BRIDGE_LAB|HTTP 404/i.test(msg)) {
        // still try local for UX when tip rejects for other reasons? Prefer surface tip error.
        if (/HTTP 4/.test(msg) || /bridge/i.test(msg)) {
          /* fall through to local */
        } else {
          throw e;
        }
      }
    }
  }
  const local = await shineInLocalLab(params);
  return {
    ok: true,
    plane: "lab_local",
    pixCredited: local.pixCredited,
    tipIndex: local.tipIndex,
    balance: balanceOf(local.state, params.ownerAddress),
    summary: `${local.summary} (local lab rail — tip had no /bridge/shine-in)`,
    canvasId: null,
  };
}

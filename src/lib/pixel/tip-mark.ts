/**
 * Tip mark discipline — every real Continuity / Kindling / booth settle
 * returns a receipt: which canvas, which tip, and how it attached.
 *
 * attachment:
 *   lab_local    — real UTXOs on a private / browser genesis (not the public tip)
 *   node_sidecar — Continuity session beside the node (not node.chain tip)
 *   shared_tip   — settled on the tip Billboard / /sync shows (canvas match)
 *
 * Dream ≠ claim: only shared_tip may be marketed as the public picture.
 */

import type { Hex } from "./crypto";
import type { PixelChainState } from "./chain";
import { canvasIdOf, formatCanvasId, type CanvasId } from "./canvas-id";

export type TipMarkKind = "continuity-digest" | "kindling" | "booth-sale" | "booth-till";

export type SettlementPlane = "lab_local" | "node_sidecar" | "shared_tip";

export interface TipMarkReceipt {
  canvasId: CanvasId;
  tipIndex: number;
  tipHash: Hex;
  txid: string;
  kind: TipMarkKind;
  attachment: SettlementPlane;
}

export function tipMarkFromState(
  state: PixelChainState,
  kind: TipMarkKind,
  attachment: SettlementPlane,
  txid?: string,
): TipMarkReceipt {
  const tip = state.pixels[state.pixels.length - 1];
  if (!tip) throw new Error("empty chain — no tip mark");
  const lastTx = tip.transactions[tip.transactions.length - 1];
  return {
    canvasId: canvasIdOf(state),
    tipIndex: tip.index,
    tipHash: tip.hash,
    txid: txid ?? lastTx?.txid ?? tip.hash,
    kind,
    attachment,
  };
}

export function settlementHonesty(plane: SettlementPlane): string {
  switch (plane) {
    case "shared_tip":
      return "Settled on the shared tip — the public picture.";
    case "node_sidecar":
      return "Settled on Continuity sidecar chain — real UTXOs, not the node ledger tip Billboard shows.";
    case "lab_local":
    default:
      return "Settled on lab Continuity / local genesis — real UTXOs, not the public tip of humanity.";
  }
}

export function tipMarkSummary(mark: TipMarkReceipt): string {
  return `${mark.kind} · ${settlementHonesty(mark.attachment)} · canvas ${formatCanvasId(mark.canvasId)} · tip #${mark.tipIndex}`;
}

/** Fetch tip canvas from RPC and assert match before claiming shared_tip. */
export async function fetchTipCanvas(
  rpcBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CanvasId> {
  const base = rpcBase.replace(/\/$/, "");
  const health = (await fetchImpl(`${base}/health`).then((r) => {
    if (!r.ok) throw new Error(`health ${r.status}`);
    return r.json();
  })) as { networkId?: number; genesisHash?: string };
  if (typeof health.networkId === "number" && health.genesisHash) {
    return {
      networkId: health.networkId,
      genesisHash: health.genesisHash as Hex,
    };
  }
  const sync = (await fetchImpl(`${base}/sync`).then((r) => {
    if (!r.ok) throw new Error(`sync ${r.status}`);
    return r.json();
  })) as { networkId?: number; genesisHash?: string; pixels?: Array<{ hash?: string }> };
  const { canvasIdFromTipFeed } = await import("./canvas-id");
  return canvasIdFromTipFeed(sync);
}

export function tipMarkThesis(): string {
  return "Tip marks name the canvas and attachment plane. On-chain ≠ on the shared public tip.";
}

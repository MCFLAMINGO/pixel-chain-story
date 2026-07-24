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

import type { Hex, LightKeypair } from "./crypto";
import { proposeTransfer, stateFromPixels, type PixelChainState, type SequencerId } from "./chain";
import type { ReadableMeta, Transaction } from "./transaction";
import {
  assertSameCanvas,
  canvasIdFromTipFeed,
  canvasIdOf,
  formatCanvasId,
  type CanvasId,
} from "./canvas-id";

export type TipMarkKind =
  | "continuity-digest"
  | "kindling"
  | "booth-sale"
  | "booth-till"
  | "people-pay";

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
  return canvasIdFromTipFeed(sync);
}

/** Pull full tip state for local signing against the shared picture. */
export async function pullTipState(
  rpcBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ state: PixelChainState; canvasId: CanvasId }> {
  const base = rpcBase.replace(/\/$/, "");
  const sync = (await fetchImpl(`${base}/sync`).then((r) => {
    if (!r.ok) throw new Error(`sync ${r.status}`);
    return r.json();
  })) as {
    networkId?: number;
    genesisHash?: string;
    pixels: PixelChainState["pixels"];
    sequencers: SequencerId[];
  };
  if (!Array.isArray(sync.pixels) || sync.pixels.length === 0) {
    throw new Error("tip feed has no pixels");
  }
  const sequencers = sync.sequencers?.length
    ? sync.sequencers
    : [
        {
          address: sync.pixels[0]!.lightProof.sequencerAddress,
          publicKey: "00" as Hex,
        },
      ];
  const state = stateFromPixels(sync.pixels, sequencers, sync.networkId);
  const canvasId = canvasIdOf(state);
  if (sync.genesisHash && sync.genesisHash !== canvasId.genesisHash) {
    throw new Error("sync genesisHash ≠ pixels[0].hash");
  }
  return { state, canvasId };
}

export async function submitTxViaRpc(
  rpcBase: string,
  tx: Transaction,
  fetchImpl: typeof fetch = fetch,
): Promise<{ tip: number; pending: number; txid: string }> {
  const base = rpcBase.replace(/\/$/, "");
  const res = await fetchImpl(`${base}/tx`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tx),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    tip?: number;
    pending?: number;
    txid?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `POST /tx failed (${res.status})`);
  }
  return {
    tip: body.tip ?? 0,
    pending: body.pending ?? 0,
    txid: body.txid ?? tx.txid,
  };
}

/** Poll /sync until txid appears in a tip pixel (or timeout). */
export async function waitForTxOnTip(
  rpcBase: string,
  txid: string,
  opts?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<TipMarkReceipt> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 20_000;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { state, canvasId } = await pullTipState(rpcBase, fetchImpl);
    for (let i = state.pixels.length - 1; i >= 0; i--) {
      const pixel = state.pixels[i]!;
      if (pixel.transactions.some((t) => t.txid === txid)) {
        return {
          canvasId,
          tipIndex: pixel.index,
          tipHash: pixel.hash,
          txid,
          kind: "people-pay",
          attachment: "shared_tip",
        };
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`txid ${txid.slice(0, 16)}… not on tip within ${timeoutMs}ms`);
}

/**
 * Sign a transfer against the live /sync tip and POST /tx.
 * Receipt is `shared_tip` only after canvas match + tip inclusion.
 */
export async function attachTransferViaRpc(opts: {
  rpcBase: string;
  from: LightKeypair;
  toAddress: string;
  amount: number;
  metadata: ReadableMeta;
  kind?: TipMarkKind;
  expectedCanvas?: CanvasId;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ tipMark: TipMarkReceipt; tx: Transaction }> {
  if (opts.amount <= 0) throw new Error("amount must be positive");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { state, canvasId } = await pullTipState(opts.rpcBase, fetchImpl);
  if (opts.expectedCanvas) assertSameCanvas(opts.expectedCanvas, canvasId);

  const spoken = await proposeTransfer(
    state,
    opts.from,
    [{ address: opts.toAddress, amount: opts.amount }],
    opts.metadata,
  );
  await submitTxViaRpc(opts.rpcBase, spoken.tx, fetchImpl);
  const tipMark = await waitForTxOnTip(opts.rpcBase, spoken.tx.txid, {
    timeoutMs: opts.timeoutMs,
    fetchImpl,
  });
  tipMark.kind = opts.kind ?? "people-pay";
  tipMark.attachment = "shared_tip";
  return { tipMark, tx: spoken.tx };
}

export function tipMarkThesis(): string {
  return "Tip marks name the canvas and attachment plane. On-chain ≠ on the shared public tip.";
}

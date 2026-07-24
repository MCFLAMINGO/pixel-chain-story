/**
 * Canvas identity — same picture, not same networkId alone.
 *
 * `PIXEL_NETWORK_ID` is a family constant. Join means matching
 * `(networkId, genesisHash)` where genesisHash is pixels[0].hash.
 * Two `createGenesis` calls are two Earths.
 */

import type { Hex } from "./crypto";
import type { PixelChainState } from "./chain";

export interface CanvasId {
  networkId: number;
  genesisHash: Hex;
}

/** Genesis pixel hash — the unique canvas instance id. */
export function genesisHashOf(state: PixelChainState): Hex {
  const g = state.pixels[0];
  if (!g?.hash) throw new Error("Chain has no genesis — cannot form canvas id");
  return g.hash;
}

export function canvasIdOf(state: PixelChainState): CanvasId {
  return {
    networkId: state.networkId,
    genesisHash: genesisHashOf(state),
  };
}

export function canvasIdEqual(a: CanvasId, b: CanvasId): boolean {
  return a.networkId === b.networkId && a.genesisHash === b.genesisHash;
}

export function assertSameCanvas(expected: CanvasId, observed: CanvasId): void {
  if (!canvasIdEqual(expected, observed)) {
    throw new Error(
      `Canvas mismatch — expected ${formatCanvasId(expected)}, got ${formatCanvasId(observed)}. Same networkId is not the same picture.`,
    );
  }
}

/** Short human form for UI / ops notes. */
export function formatCanvasId(id: CanvasId, hashChars = 12): string {
  return `${id.networkId}:${id.genesisHash.slice(0, hashChars)}`;
}

/** Compact string for RPC / storage (`networkId:fullGenesisHash`). */
export function canvasIdKey(id: CanvasId): string {
  return `${id.networkId}:${id.genesisHash}`;
}

export function parseCanvasIdKey(key: string): CanvasId {
  const i = key.indexOf(":");
  if (i < 1) throw new Error("bad canvasId key");
  const networkId = Number(key.slice(0, i));
  const genesisHash = key.slice(i + 1) as Hex;
  if (!Number.isFinite(networkId) || genesisHash.length < 32) {
    throw new Error("bad canvasId key");
  }
  return { networkId, genesisHash };
}

/** Pull canvas id from a node `/health` or `/sync` JSON body. */
export function canvasIdFromTipFeed(body: {
  networkId?: number;
  genesisHash?: string;
  pixels?: Array<{ hash?: string }>;
}): CanvasId {
  const networkId = body.networkId;
  if (typeof networkId !== "number") throw new Error("tip feed missing networkId");
  const genesisHash = (body.genesisHash ?? body.pixels?.[0]?.hash) as Hex | undefined;
  if (!genesisHash || genesisHash.length < 32) {
    throw new Error("tip feed missing genesisHash");
  }
  return { networkId, genesisHash };
}

export function canvasIdThesis(): string {
  return "Canvas identity is (networkId, genesisHash). Matching PIX family id alone is not the same public picture.";
}

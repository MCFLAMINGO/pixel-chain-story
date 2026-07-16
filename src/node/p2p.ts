/**
 * Minimal WebSocket gossip mesh for Pixel Ledger.
 * Messages share txs and illuminated pixels (not “blocks”).
 */

import type { LedgerPixel, Transaction } from "../lib/pixel/index";

export type PeerMessage =
  | { type: "hello"; nodeId: string; address: string; tip: number; tipHash: string }
  | { type: "ping"; t: number }
  | { type: "pong"; t: number }
  | { type: "tx"; tx: Transaction }
  | { type: "pixel"; pixel: LedgerPixel }
  | { type: "get_pixels"; from: number }
  | { type: "pixels"; pixels: LedgerPixel[] };

export type MessageHandler = (msg: PeerMessage, peerUrl: string) => void | Promise<void>;

export interface GossipNet {
  broadcast(msg: PeerMessage): void;
  addPeer(url: string): void;
  peerCount(): number;
  stop(): void;
}

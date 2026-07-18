/**
 * Minimal WebSocket gossip mesh for Pixel Ledger.
 * Messages share txs and illuminated pixels (not “blocks”).
 */

import type {
  LedgerPixel,
  PixelHeader,
  SequencerId,
  Transaction,
} from "../lib/pixel/index";

export type PeerMessage =
  | {
      type: "hello";
      nodeId: string;
      address: string;
      tip: number;
      tipHash: string;
      /** How peers should dial us back (ws://host:port/gossip) */
      gossipUrl?: string;
      publicKey?: string;
      /** Full local sequencer registry — mesh must converge before lottery tips. */
      sequencers?: SequencerId[];
      /** Gate F — signature over helloCanonical(...) */
      helloSig?: string;
    }
  | { type: "ping"; t: number }
  | { type: "pong"; t: number }
  | { type: "tx"; tx: Transaction }
  | { type: "pixel"; pixel: LedgerPixel }
  | { type: "get_pixels"; from: number }
  | { type: "pixels"; pixels: LedgerPixel[] }
  | { type: "get_headers"; from: number }
  | { type: "headers"; headers: PixelHeader[] };

export type MessageHandler = (msg: PeerMessage, peerUrl: string) => void | Promise<void>;

export interface GossipNet {
  broadcast(msg: PeerMessage): void;
  /** Unicast — used for catch-up replies so we don’t flood. */
  sendTo(peerUrl: string, msg: PeerMessage): void;
  /** Re-hello with current tip + sequencer registry (mesh convergence). */
  announce(): void;
  addPeer(url: string): void;
  peerCount(): number;
  peerUrls(): string[];
  stop(): void;
  /** Advertised dial URL for this node, if known. */
  localGossipUrl(): string | null;
}

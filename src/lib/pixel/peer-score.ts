/**
 * Peer identity + scoring — Gate F eclipse basics.
 *
 * Signed hello binds address ↔ tip claim. Scores rise on valid headers/pixels,
 * fall on lies. A single low-score peer should not eclipse an honest tip when
 * another peer agrees with the local chain.
 */

import { type Hex, type LightKeypair } from "./crypto";
import { signPixel, verifyPixel } from "./scheme";

export interface PeerRecord {
  peerUrl: string;
  address: string;
  publicKey: Hex;
  tip: number;
  tipHash: Hex;
  score: number;
  lastSeen: number;
  lastHelloOk: boolean;
}

export interface PeerBookState {
  peers: Map<string, PeerRecord>;
}

export function createPeerBook(): PeerBookState {
  return { peers: new Map() };
}

/** Canonical string signed in gossip hello (textbook payload, not a rename). */
export function helloCanonical(params: {
  address: string;
  tip: number;
  tipHash: string;
  gossipUrl?: string;
}): string {
  return `pixel-hello|${params.address}|${params.tip}|${params.tipHash}|${params.gossipUrl ?? ""}`;
}

export async function signHello(
  keypair: LightKeypair,
  tip: number,
  tipHash: Hex,
  gossipUrl?: string,
): Promise<string> {
  // Gate D: hello must follow keypair scheme (ML-DSA default; OTS still ok).
  return signPixel(
    helloCanonical({
      address: keypair.address,
      tip,
      tipHash,
      gossipUrl,
    }),
    keypair,
  );
}

export async function verifyHelloAuth(params: {
  address: string;
  publicKey: Hex;
  tip: number;
  tipHash: string;
  gossipUrl?: string;
  signature: string;
}): Promise<boolean> {
  const msg = helloCanonical(params);
  return verifyPixel(msg, params.signature, params.publicKey);
}

export function notePeerHello(
  book: PeerBookState,
  peerUrl: string,
  rec: Omit<PeerRecord, "score" | "lastSeen" | "lastHelloOk" | "peerUrl"> & {
    helloOk: boolean;
  },
): PeerRecord {
  const prev = book.peers.get(peerUrl);
  const score = (prev?.score ?? 0) + (rec.helloOk ? 1 : -5);
  const next: PeerRecord = {
    peerUrl,
    address: rec.address,
    publicKey: rec.publicKey,
    tip: rec.tip,
    tipHash: rec.tipHash,
    score,
    lastSeen: Date.now(),
    lastHelloOk: rec.helloOk,
  };
  book.peers.set(peerUrl, next);
  return next;
}

export function rewardPeer(book: PeerBookState, peerUrl: string, delta = 1): void {
  const p = book.peers.get(peerUrl);
  if (!p) return;
  p.score += delta;
  p.lastSeen = Date.now();
}

export function punishPeer(book: PeerBookState, peerUrl: string, delta = 3): void {
  const p = book.peers.get(peerUrl);
  if (!p) return;
  p.score -= delta;
  p.lastSeen = Date.now();
}

/**
 * Eclipse guard: if another peered tipHash at same height disagrees with
 * `candidate`, require candidate peer score ≥ best agreeing peer score.
 */
export function shouldAcceptTipFromPeer(
  book: PeerBookState,
  peerUrl: string,
  candidate: { tip: number; tipHash: string },
): { accept: boolean; reason?: string } {
  const peer = book.peers.get(peerUrl);
  if (peer && !peer.lastHelloOk) {
    return { accept: false, reason: "unsigned or bad hello" };
  }
  if (peer && peer.score < -2) {
    return { accept: false, reason: "peer score too low" };
  }
  let bestAgree = peer?.score ?? 0;
  for (const [url, p] of book.peers) {
    if (url === peerUrl) continue;
    if (p.tip === candidate.tip && p.tipHash === candidate.tipHash && p.score > bestAgree) {
      bestAgree = p.score;
    }
    if (
      p.tip === candidate.tip &&
      p.tipHash !== candidate.tipHash &&
      p.score > (peer?.score ?? 0) &&
      p.lastHelloOk
    ) {
      return {
        accept: false,
        reason: "eclipse: higher-score peer disagrees on tipHash",
      };
    }
  }
  return { accept: true };
}

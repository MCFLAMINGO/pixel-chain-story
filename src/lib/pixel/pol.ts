/**
 * Proof of Light Sequence (PoLS)
 *
 * Energy-saving consensus: sequencers take turns producing lightweight proofs.
 * No hash grinding. A verifiable beacon + hash-based signature "shines light"
 * and collapses pending transactions from superposition into reality.
 *
 * Gate C: if the elected sequencer is silent past POLS_STALL_MS, the next
 * address in the rotation may illuminate with skipCount ≥ 1 (lab fault path).
 */

import { createHash } from "node:crypto";
import { sha512Hex, type Hex, type LightKeypair } from "./crypto";
import { addressForScheme, signPixel, verifyPixel, type SchemeId } from "./scheme";
import { opticalBeacon } from "./optical";

/** Tip silent this long ⇒ skip justified (lab clock; not BFT). */
export const POLS_STALL_MS = 15_000;

/** Max skips per height — bounds griefing; still lab, not Byzantine quorum. */
export const POLS_MAX_SKIP = 8;

/** Sync SHA-512 for leader lottery (public inputs only — not a private VRF). */
function lotteryScore(prevHash: Hex, sequence: number, address: string): string {
  return createHash("sha512")
    .update(`pols-lottery|${prevHash}|${sequence}|${address}`)
    .digest("hex");
}

export interface LightProof {
  sequence: number;
  sequencerAddress: string;
  /** Master public key (OTS Merkle root or ML-DSA pk). */
  sequencerPublicKey: Hex;
  /** Scheme used for the light proof signature. */
  scheme?: SchemeId;
  beacon: Hex;
  prevHash: Hex;
  signature: string;
  revealedAt: number;
  /**
   * How many elected sequencers were skipped for this height (0 = on-time).
   * Bound into the signed message so peers can verify election + stall.
   */
  skipCount?: number;
  /**
   * Ordered electable set used for this height's lottery (lab).
   * Bound into the signed message so join/registry growth cannot rewrite history.
   */
  electable?: string[];
}

/** Commitment over ordered electable addresses (bound into PoLS message). */
export function electableCommitment(electable: string[]): string {
  return createHash("sha512")
    .update(`pols-electable|${electable.join("|")}`)
    .digest("hex");
}

/**
 * Lab leader lottery — lowest SHA-512(prevHash|sequence|address) wins.
 *
 * Deterministic and checkable from public inputs. Not a cryptographic VRF
 * (no unbiasable private proof) and not BFT. Permissioned sequencer set only.
 */
export function selectSequencer(
  prevHash: Hex,
  sequence: number,
  sequencerAddresses: string[],
): string {
  if (sequencerAddresses.length === 0) {
    throw new Error("No sequencers registered");
  }
  let best = sequencerAddresses[0];
  let bestScore = lotteryScore(prevHash, sequence, best);
  for (let i = 1; i < sequencerAddresses.length; i++) {
    const addr = sequencerAddresses[i];
    const score = lotteryScore(prevHash, sequence, addr);
    if (score < bestScore || (score === bestScore && addr < best)) {
      best = addr;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Election with skip: start at selectSequencer(...), advance `skipCount`
 * positions in the registered address list (mod n).
 */
export function selectSequencerWithSkip(
  prevHash: Hex,
  sequence: number,
  sequencerAddresses: string[],
  skipCount = 0,
): string {
  if (skipCount < 0 || skipCount > POLS_MAX_SKIP) {
    throw new Error(`skipCount out of range 0..${POLS_MAX_SKIP}`);
  }
  if (sequencerAddresses.length === 0) {
    throw new Error("No sequencers registered");
  }
  const base = selectSequencer(prevHash, sequence, sequencerAddresses);
  if (skipCount === 0) return base;
  const idx = sequencerAddresses.indexOf(base);
  const start = idx >= 0 ? idx : 0;
  return sequencerAddresses[(start + skipCount) % sequencerAddresses.length];
}

export function polsMessage(
  sequence: number,
  prevHash: Hex,
  beacon: Hex,
  address: string,
  skipCount = 0,
  electable?: string[],
): string {
  const el = electable && electable.length > 0 ? `|el=${electableCommitment(electable)}` : "";
  return `pols|${sequence}|${prevHash}|${beacon}|${address}|skip=${skipCount}${el}`;
}

export async function createLightProof(params: {
  sequence: number;
  prevHash: Hex;
  sequencer: LightKeypair;
  skipCount?: number;
  /** Ordered electable set for this height (defaults to [sequencer]). */
  electable?: string[];
}): Promise<LightProof> {
  const skipCount = params.skipCount ?? 0;
  const electable =
    params.electable && params.electable.length > 0
      ? [...params.electable]
      : [params.sequencer.address];
  if (!electable.includes(params.sequencer.address)) {
    throw new Error("Sequencer not in electable set");
  }
  const beacon = await opticalBeacon(params.sequence, params.prevHash);
  const message = polsMessage(
    params.sequence,
    params.prevHash,
    beacon,
    params.sequencer.address,
    skipCount,
    electable,
  );
  const signature = await signPixel(message, params.sequencer);
  const scheme = (params.sequencer.scheme ?? "PIX-HASH-OTS-128") as SchemeId;
  return {
    sequence: params.sequence,
    sequencerAddress: params.sequencer.address,
    sequencerPublicKey: params.sequencer.publicKey,
    scheme,
    beacon,
    prevHash: params.prevHash,
    signature,
    revealedAt: Date.now(),
    skipCount,
    electable,
  };
}

export async function verifyLightProof(
  proof: LightProof,
  expectedSequencer: string,
): Promise<boolean> {
  if (proof.sequencerAddress !== expectedSequencer) return false;
  const skipCount = proof.skipCount ?? 0;
  const scheme = (proof.scheme ?? "PIX-HASH-OTS-128") as SchemeId;
  // Bind address ↔ master public key (closes forged-pubkey-with-elected-address).
  if ((await addressForScheme(proof.sequencerPublicKey, scheme)) !== proof.sequencerAddress) {
    return false;
  }
  const expectedBeacon = await opticalBeacon(proof.sequence, proof.prevHash);
  if (expectedBeacon !== proof.beacon) return false;
  if (proof.electable && proof.electable.length > 0) {
    if (!proof.electable.includes(proof.sequencerAddress)) return false;
  }
  const message = polsMessage(
    proof.sequence,
    proof.prevHash,
    proof.beacon,
    proof.sequencerAddress,
    skipCount,
    proof.electable,
  );
  return verifyPixel(message, proof.signature, proof.sequencerPublicKey);
}

/**
 * Fork-choice at equal height: prefer lower skipCount (on-time light),
 * then lower hash. Depth-1 tip replace only — not a reorg market.
 */
export function preferPixel(a: LedgerPixelLike, b: LedgerPixelLike): LedgerPixelLike {
  if (a.index !== b.index) return a.index > b.index ? a : b;
  const sa = a.lightProof.skipCount ?? 0;
  const sb = b.lightProof.skipCount ?? 0;
  if (sa !== sb) return sa < sb ? a : b;
  return a.hash <= b.hash ? a : b;
}

export interface LedgerPixelLike {
  index: number;
  hash: Hex;
  lightProof: LightProof;
}

/** Energy profile note for UI — PoLS work is O(signature verify), not O(hashrate). */
export function estimatePoLSCost(): {
  model: string;
  relativeToPoW: string;
  relativeToPoS: string;
  note: string;
} {
  return {
    model: "Proof of Light Sequence",
    relativeToPoW: "~1000x–1,000,000x less energy (no mining farms)",
    relativeToPoS: "Similar or lower — no large stake lockup required for light clients",
    note: "Sequencer signs once per block; phones verify in milliseconds. Stall → skip (Gate C lab).",
  };
}

export async function merkleRoot(txids: string[]): Promise<Hex> {
  if (txids.length === 0) return sha512Hex("empty-merkle");
  let layer = [...txids];
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? left;
      next.push(await sha512Hex(`${left}|${right}`));
    }
    layer = next;
  }
  return layer[0];
}

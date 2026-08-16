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

import { sha512Hex, sha512SyncHex, type Hex, type LightKeypair } from "./crypto";
import { addressForScheme, signPixel, verifyPixel, type SchemeId } from "./scheme";
import { opticalBeacon } from "./optical";

/** Tip silent this long ⇒ skip justified (lab clock; not BFT). */
export const POLS_STALL_MS = 15_000;

/** Max skips per height — bounds griefing; still lab, not Byzantine quorum. */
export const POLS_MAX_SKIP = 8;

/**
 * How far ahead of local time a block timestamp may sit.
 *
 * Timestamps gate the skip window, so an unbounded future timestamp lets a
 * producer manufacture a stall it is not entitled to (PIX-14).
 */
export const POLS_MAX_FUTURE_DRIFT_MS = 120_000;

/** Sync SHA-512 for leader lottery (public inputs only — not a private VRF). */
function lotteryScore(prevHash: Hex, sequence: number, address: string): string {
  return sha512SyncHex(`pols-lottery|${prevHash}|${sequence}|${address}`);
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
  /**
   * Sphere combination lock — digest of FieldWitness peers (opacity ∈ opaque/translucent/lit).
   * Bound into the signed message; acceptBlock recomputes and rejects mismatch.
   * Invent: not a rename of prevHash.
   */
  fieldDigest: Hex;
  /**
   * Lead wave — digest of lattice multi-hop neighbor hits + collision fold.
   * Bound into the signed message; acceptBlock recomputes and rejects mismatch.
   * Invent (SPATIAL S2): tip physics, not UI glitter.
   */
  waveDigest: Hex;
  /**
   * Sparse occupancy Merkle root over illuminated lattice cells (picture).
   * Bound into the signed message; acceptBlock recomputes and rejects mismatch.
   * Invent (SPATIAL S3): verifiable illuminated picture fragment.
   */
  spatialRoot: Hex;
  /**
   * Digest over this pixel's sequencer membership records (T1.1).
   *
   * Absent when the pixel changes no membership, which keeps the signed message
   * byte-identical to what it was before membership existed — the same technique
   * `electable` uses with its `el=` segment. That is why all 47 pixels of the
   * crowned chain still verify.
   */
  membershipDigest?: Hex;
}

/** Commitment over ordered electable addresses (bound into PoLS message). */
export function electableCommitment(electable: string[]): string {
  return sha512SyncHex(`pols-electable|${electable.join("|")}`);
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
  fieldDigest?: string,
  waveDigest?: string,
  spatialRoot?: string,
  membershipDigest?: string,
): string {
  const el = electable && electable.length > 0 ? `|el=${electableCommitment(electable)}` : "";
  const field = `|field=${fieldDigest ?? ""}`;
  const wave = `|wave=${waveDigest ?? ""}`;
  const spatial = `|spatial=${spatialRoot ?? ""}`;
  // Appended only when present, so a pixel that changes no membership signs exactly
  // the message it would have signed before this field existed. Every light proof on
  // the crowned chain keeps verifying because of this one conditional.
  const membership = membershipDigest ? `|members=${membershipDigest}` : "";
  return `pols|${sequence}|${prevHash}|${beacon}|${address}|skip=${skipCount}${el}${field}${wave}${spatial}${membership}`;
}

export async function createLightProof(params: {
  sequence: number;
  prevHash: Hex;
  sequencer: LightKeypair;
  skipCount?: number;
  /** Ordered electable set for this height (defaults to [sequencer]). */
  electable?: string[];
  /** Sphere lock digest — required for tip custody (FieldWitness). */
  fieldDigest: Hex;
  /** Lead wave digest — required for tip neighbor physics (SPATIAL S2). */
  waveDigest: Hex;
  /** Sparse occupancy Merkle — required for tip picture (SPATIAL S3). */
  spatialRoot: Hex;
  /** Membership digest — omitted when this pixel changes no membership (T1.1). */
  membershipDigest?: Hex;
}): Promise<LightProof> {
  const skipCount = params.skipCount ?? 0;
  const electable =
    params.electable && params.electable.length > 0
      ? [...params.electable]
      : [params.sequencer.address];
  if (!electable.includes(params.sequencer.address)) {
    throw new Error("Sequencer not in electable set");
  }
  const fieldDigest = params.fieldDigest;
  if (!fieldDigest) {
    throw new Error("fieldDigest required (sphere combination lock)");
  }
  const waveDigest = params.waveDigest;
  if (!waveDigest) {
    throw new Error("waveDigest required (lead wave)");
  }
  const spatialRoot = params.spatialRoot;
  if (!spatialRoot) {
    throw new Error("spatialRoot required (illuminated picture)");
  }
  const beacon = await opticalBeacon(params.sequence, params.prevHash);
  const message = polsMessage(
    params.sequence,
    params.prevHash,
    beacon,
    params.sequencer.address,
    skipCount,
    electable,
    fieldDigest,
    waveDigest,
    spatialRoot,
    params.membershipDigest,
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
    fieldDigest,
    waveDigest,
    spatialRoot,
    ...(params.membershipDigest ? { membershipDigest: params.membershipDigest } : {}),
  };
}

/**
 * Verify a PoLS proof.
 *
 * `verify` is injectable for the same reason it is on transactions: the signature
 * construction changed once (PIX-10/PIX-16), so replaying a pixel from before that
 * change needs the rule that applied then. `sig-era.ts` decides which; the default
 * is the current one, so every produce path and `acceptBlock` are unaffected.
 */
export async function verifyLightProof(
  proof: LightProof,
  expectedSequencer: string,
  verify: (
    message: string,
    signatureJson: string,
    publicKey: Hex,
  ) => Promise<boolean> = verifyPixel,
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
  if (!proof.fieldDigest) return false;
  if (!proof.waveDigest) return false;
  if (!proof.spatialRoot) return false;
  const message = polsMessage(
    proof.sequence,
    proof.prevHash,
    proof.beacon,
    proof.sequencerAddress,
    skipCount,
    proof.electable,
    proof.fieldDigest,
    proof.waveDigest,
    proof.spatialRoot,
    proof.membershipDigest,
  );
  return verify(message, proof.signature, proof.sequencerPublicKey);
}

/**
 * Does a pixel's light proof describe the pixel it is attached to?
 *
 * A PoLS proof carries its own `sequence` and `prevHash`, and both feed the signed
 * message — `prevHash` also feeds `opticalBeacon`. Nothing tied either of them to the
 * block's own fields, so a proof could be signed about one position in the chain and
 * stapled to a block claiming another.
 *
 * This existed in two places and not in the one that mattered. `verifyHeaderChain` in
 * light-client.ts checked `lightProof.prevHash`, and so did `bridge.ts` — which meant
 * the phone-capable light client was a **stricter validator than the full node with
 * final authority.** That is backwards, and it is the shape of bug that survives
 * review for years because each file looks reasonable on its own.
 *
 * So the check lives here now, once, and all three call it. The missing `if` in
 * `acceptBlock` was the symptom; three implementations of one rule was the disease.
 *
 * Returns a reason or null, so callers that return verdicts and callers that throw can
 * each do their own thing with it.
 */
export function proofBindingProblem(pixel: {
  prevHash: Hex;
  sequence?: number;
  lightProof: LightProof;
}): string | null {
  if (pixel.lightProof.prevHash !== pixel.prevHash) {
    return "light proof binds a different parent than the block links to";
  }
  if (pixel.sequence != null && pixel.lightProof.sequence !== pixel.sequence) {
    return `light proof is for sequence ${pixel.lightProof.sequence}, block claims ${pixel.sequence}`;
  }
  return null;
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

/** Sibling path proving `txids[index]` is under `merkleRoot(txids)`. */
export async function merkleProof(txids: string[], index: number): Promise<Hex[]> {
  if (index < 0 || index >= txids.length) {
    throw new Error(`merkleProof index ${index} out of range (${txids.length} leaves)`);
  }
  const path: Hex[] = [];
  let layer = [...txids];
  let i = index;
  while (layer.length > 1) {
    const sibling = i % 2 === 0 ? (layer[i + 1] ?? layer[i]) : layer[i - 1];
    path.push(sibling);
    const next: string[] = [];
    for (let j = 0; j < layer.length; j += 2) {
      const left = layer[j];
      const right = layer[j + 1] ?? left;
      next.push(await sha512Hex(`${left}|${right}`));
    }
    layer = next;
    i = Math.floor(i / 2);
  }
  return path;
}

/** Recompute the root from a leaf + sibling path (inclusion check). */
export async function verifyMerkleProof(params: {
  leaf: string;
  index: number;
  path: Hex[];
  root: Hex;
  leafCount: number;
}): Promise<boolean> {
  if (params.index < 0 || params.index >= params.leafCount) return false;
  const expectedDepth = Math.ceil(Math.log2(Math.max(1, params.leafCount)));
  if (params.path.length !== expectedDepth) return false;
  let hash = params.leaf;
  let i = params.index;
  for (const sibling of params.path) {
    hash =
      i % 2 === 0 ? await sha512Hex(`${hash}|${sibling}`) : await sha512Hex(`${sibling}|${hash}`);
    i = Math.floor(i / 2);
  }
  return hash === params.root;
}

/**
 * Light client primitives — Gate F.
 *
 * Headers-first sync + balance merkle proofs against a tip state root.
 * Phone-capable verify: no full UTXO map required to check one address.
 *
 * Honesty: stateRoot is computed from tip UTXOs for light proofs today;
 * historical per-pixel state commitments are a later hardening step.
 */

import { sha512Hex, type Hex } from "./crypto";
import { verifyLightProof, type LightProof } from "./pol";
import type { LedgerPixel, PixelChainState } from "./chain";
import { balanceOf } from "./chain";

export interface PixelHeader {
  index: number;
  prevHash: Hex;
  hash: Hex;
  /** Transaction merkle root for this pixel */
  merkleRoot: Hex;
  sequence: number;
  timestamp: number;
  sequencerAddress: string;
  lightProof: LightProof;
}

export interface HeadersSyncPackage {
  networkId: number;
  /** Genesis pixel hash — canvas instance (join credential with networkId) */
  genesisHash: Hex;
  tip: number;
  tipHash: Hex;
  /** Tip UTXO set root — verify balance proofs against this */
  stateRoot: Hex;
  headers: PixelHeader[];
  sequencers: Array<{ address: string; publicKey: Hex }>;
}

export interface BalanceProof {
  address: string;
  amount: number;
  /** Sorted unique addresses that hold UTXOs (leaf order) */
  leafIndex: number;
  /** Sibling hashes from leaf to root (bottom-up) */
  siblings: Hex[];
  stateRoot: Hex;
}

function balanceLeaf(address: string, amount: number): Promise<Hex> {
  return sha512Hex(`bal|${address}|${amount}`);
}

/** Aggregate balances by address, sorted lexicographically for stable merkle. */
export function balanceLeaves(state: PixelChainState): Array<{ address: string; amount: number }> {
  const map = new Map<string, number>();
  for (const u of state.utxos.values()) {
    map.set(u.address, (map.get(u.address) ?? 0) + u.amount);
  }
  return [...map.entries()]
    .map(([address, amount]) => ({ address, amount }))
    .sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
}

async function merkleParent(left: Hex, right: Hex): Promise<Hex> {
  return sha512Hex(`${left}|${right}`);
}

/** State root over sorted address balances (empty set → fixed sentinel). */
export async function computeStateRoot(state: PixelChainState): Promise<Hex> {
  const leaves = balanceLeaves(state);
  if (leaves.length === 0) return sha512Hex("empty-state-root");
  let layer: Hex[] = [];
  for (const row of leaves) {
    layer.push(await balanceLeaf(row.address, row.amount));
  }
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? left;
      next.push(await merkleParent(left, right));
    }
    layer = next;
  }
  return layer[0];
}

export async function proveBalance(
  state: PixelChainState,
  address: string,
): Promise<BalanceProof | null> {
  const leaves = balanceLeaves(state);
  const leafIndex = leaves.findIndex((l) => l.address === address);
  if (leafIndex < 0) {
    // Zero balance — prove absence via empty/not-in-tree: return amount 0 with no path
    // Light clients treat missing leaf as 0 only if they trust full leaf set size elsewhere.
    // For MVP: explicit zero proof when address absent.
    const stateRoot = await computeStateRoot(state);
    return {
      address,
      amount: 0,
      leafIndex: -1,
      siblings: [],
      stateRoot,
    };
  }
  let layer: Hex[] = [];
  for (const row of leaves) {
    layer.push(await balanceLeaf(row.address, row.amount));
  }
  const siblings: Hex[] = [];
  let idx = leafIndex;
  while (layer.length > 1) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    const sibling = layer[siblingIdx] ?? layer[idx];
    siblings.push(sibling);
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? left;
      next.push(await merkleParent(left, right));
    }
    layer = next;
    idx = Math.floor(idx / 2);
  }
  return {
    address,
    amount: leaves[leafIndex].amount,
    leafIndex,
    siblings,
    stateRoot: layer[0],
  };
}

export async function verifyBalanceProof(proof: BalanceProof): Promise<boolean> {
  if (proof.amount === 0 && proof.leafIndex < 0) {
    // Absence claim: only valid if stateRoot matches empty or caller also checks
    // against a trusted tip package. We accept explicit zero proofs that carry
    // the tip stateRoot (client must obtain stateRoot from headers sync).
    return proof.siblings.length === 0 && proof.stateRoot.length >= 64;
  }
  if (proof.leafIndex < 0) return false;
  let hash = await balanceLeaf(proof.address, proof.amount);
  let idx = proof.leafIndex;
  for (const sibling of proof.siblings) {
    hash = idx % 2 === 0 ? await merkleParent(hash, sibling) : await merkleParent(sibling, hash);
    idx = Math.floor(idx / 2);
  }
  return hash === proof.stateRoot;
}

export function extractHeader(pixel: LedgerPixel): PixelHeader {
  return {
    index: pixel.index,
    prevHash: pixel.prevHash,
    hash: pixel.hash,
    merkleRoot: pixel.merkleRoot,
    sequence: pixel.sequence,
    timestamp: pixel.timestamp,
    sequencerAddress: pixel.lightProof.sequencerAddress,
    lightProof: pixel.lightProof,
  };
}

export function extractHeaders(pixels: LedgerPixel[]): PixelHeader[] {
  return pixels.map(extractHeader);
}

/**
 * Verify header linkage (prevHash/hash chain) and each light proof.
 * Does not require transaction bodies.
 */
export async function verifyHeaderChain(
  headers: PixelHeader[],
  trustedSequencers?: string[],
): Promise<{ ok: boolean; reason?: string }> {
  if (headers.length === 0) return { ok: false, reason: "empty headers" };
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (i > 0 && h.index !== headers[i - 1].index + 1) {
      return { ok: false, reason: `gap at ${h.index}` };
    }
    if (i > 0 && h.prevHash !== headers[i - 1].hash) {
      return { ok: false, reason: `prevHash break at ${h.index}` };
    }
    if (h.lightProof.prevHash !== h.prevHash) {
      return { ok: false, reason: `lightProof.prevHash mismatch at ${h.index}` };
    }
    const elected = h.sequencerAddress;
    if (trustedSequencers && !trustedSequencers.includes(elected)) {
      return { ok: false, reason: `untrusted sequencer at ${h.index}` };
    }
    if (!(await verifyLightProof(h.lightProof, elected))) {
      return { ok: false, reason: `bad light proof at ${h.index}` };
    }
  }
  return { ok: true };
}

export async function buildHeadersSync(state: PixelChainState): Promise<HeadersSyncPackage> {
  const headers = extractHeaders(state.pixels);
  const stateRoot = await computeStateRoot(state);
  const tip = headers.length - 1;
  const genesisHash = (state.pixels[0]?.hash ?? ("00".repeat(64) as Hex)) as Hex;
  return {
    networkId: state.networkId,
    genesisHash,
    tip,
    tipHash: tip >= 0 ? headers[tip].hash : ("00".repeat(64) as Hex),
    stateRoot,
    headers,
    sequencers: state.sequencers.map((s) => ({
      address: s.address,
      publicKey: s.publicKey,
    })),
  };
}

/** Convenience: trusted tip balance check for a light client holding only the sync package. */
export async function lightBalanceCheck(
  pkg: HeadersSyncPackage,
  proof: BalanceProof,
): Promise<{ ok: boolean; amount: number; reason?: string }> {
  if (proof.stateRoot !== pkg.stateRoot) {
    return { ok: false, amount: 0, reason: "stateRoot mismatch" };
  }
  const chainOk = await verifyHeaderChain(
    pkg.headers,
    pkg.sequencers.map((s) => s.address),
  );
  if (!chainOk.ok) return { ok: false, amount: 0, reason: chainOk.reason };
  if (!(await verifyBalanceProof(proof))) {
    return { ok: false, amount: 0, reason: "bad balance proof" };
  }
  // Cross-check against full-node helper when available is caller's job;
  // here amount is what the proof claims.
  return { ok: true, amount: proof.amount };
}

export function tipBalance(state: PixelChainState, address: string): number {
  return balanceOf(state, address);
}

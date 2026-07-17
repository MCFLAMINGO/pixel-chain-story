/**
 * Proof of Light Sequence (PoLS)
 *
 * Energy-saving consensus: sequencers take turns producing lightweight proofs.
 * No hash grinding. A verifiable beacon + hash-based signature "shines light"
 * and collapses pending transactions from superposition into reality.
 */

import { sha512Hex, type Hex, type LightKeypair } from "./crypto";
import { addressForScheme, signPixel, verifyPixel, type SchemeId } from "./scheme";
import { opticalBeacon } from "./optical";

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
}

/** Deterministic sequencer rotation from the previous block hash — no stake grind. */
export function selectSequencer(
  prevHash: Hex,
  sequence: number,
  sequencerAddresses: string[],
): string {
  if (sequencerAddresses.length === 0) {
    throw new Error("No sequencers registered");
  }
  const n = parseInt(prevHash.slice(0, 8), 16) ^ sequence;
  return sequencerAddresses[Math.abs(n) % sequencerAddresses.length];
}

export async function createLightProof(params: {
  sequence: number;
  prevHash: Hex;
  sequencer: LightKeypair;
}): Promise<LightProof> {
  const beacon = await opticalBeacon(params.sequence, params.prevHash);
  const message = `pols|${params.sequence}|${params.prevHash}|${beacon}|${params.sequencer.address}`;
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
  };
}

export async function verifyLightProof(
  proof: LightProof,
  expectedSequencer: string,
): Promise<boolean> {
  if (proof.sequencerAddress !== expectedSequencer) return false;
  const scheme = (proof.scheme ?? "PIX-HASH-OTS-128") as SchemeId;
  // Bind address ↔ master public key (closes forged-pubkey-with-elected-address).
  if ((await addressForScheme(proof.sequencerPublicKey, scheme)) !== proof.sequencerAddress) {
    return false;
  }
  const expectedBeacon = await opticalBeacon(proof.sequence, proof.prevHash);
  if (expectedBeacon !== proof.beacon) return false;
  const message = `pols|${proof.sequence}|${proof.prevHash}|${proof.beacon}|${proof.sequencerAddress}`;
  return verifyPixel(message, proof.signature, proof.sequencerPublicKey);
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
    note: "Sequencer signs once per block; phones verify in milliseconds.",
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

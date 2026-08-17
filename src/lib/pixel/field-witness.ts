/**
 * FieldWitness — sphere combination lock for tip custody.
 *
 * Invent (not rename of prevHash): tip light-proof message includes fieldDigest
 * over lattice peers at Chebyshev-3 distance ≤ FIELD_MAX_DISTANCE, with opacity
 * ∈ {opaque, translucent, lit} and opacity-weighted neighbor blend.
 * acceptPixel recomputes and rejects mismatch.
 *
 * Continuity of the scene, not simile alone. Geometry: lattice.ts (S1).
 */

import { sha512SyncHex } from "./crypto";
import { formatCoord, indexToLattice, latticePeersInSphere, neighborBlendHex } from "./lattice";

export const FIELD_MAX_DISTANCE = 2;

/** Opaque = no color; translucent = attenuated; lit = full peer color. */
export type FieldOpacity = "opaque" | "translucent" | "lit";

export type FieldWitness = {
  peerIndex: number;
  /** Lattice Chebyshev-3 distance from tip */
  distance: number;
  opacity: FieldOpacity;
  /** Empty string when opaque; peer color `#rrggbb` otherwise. */
  color: string;
  /** Packed coords of peer — part of digest canonical form */
  x: number;
  y: number;
  z: number;
  /** opacityWeight — translucent 0.5 contributes to neighborBlend */
  weight: number;
};

export {
  latticeOpacityForDistance as opacityForDistance,
  latticeOpacityWeight as opacityWeight,
} from "./lattice";

export function colorToFieldHex(color: { r: number; g: number; b: number }): string {
  return (
    "#" +
    [color.r, color.g, color.b]
      .map((n) =>
        Math.max(0, Math.min(255, Math.round(n)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/**
 * Build ordered peer witnesses for tip at `tipIndex` from prior chain colors.
 * Peers = prior pixels within lattice Chebyshev ≤ FIELD_MAX_DISTANCE of tip.
 */
export function buildFieldWitnesses(
  tipIndex: number,
  priorColors: readonly string[],
): FieldWitness[] {
  const peers = latticePeersInSphere(tipIndex, priorColors, FIELD_MAX_DISTANCE);
  return peers.map((p) => ({
    peerIndex: p.peerIndex,
    distance: p.distance,
    opacity: p.opacity,
    color: p.color,
    x: p.coord.x,
    y: p.coord.y,
    z: p.coord.z,
    weight: p.weight,
  }));
}

/** Canonical digest bound into tip light-proof message. */
export function computeFieldDigest(witnesses: readonly FieldWitness[]): string {
  const sorted = witnesses.slice().sort((a, b) => a.peerIndex - b.peerIndex);
  const blend = neighborBlendHex(
    sorted.map((w) => ({
      weight: w.weight,
      color: w.color,
    })),
  );
  const canonical = sorted
    .map(
      (w) =>
        `${w.peerIndex}@${formatCoord({ x: w.x, y: w.y, z: w.z })}:${w.distance}:${w.opacity}:${w.weight}:${w.color.toLowerCase()}`,
    )
    .join("|");
  return sha512SyncHex(`field|v2|blend=${blend.toLowerCase()}|${canonical}`);
}

/**
 * The witnesses a block *carries* must be the witnesses its state *implies*.
 *
 * `assertFieldWitnessesMatch` checks the digest bound in the light proof, which is
 * recomputed from prior state and therefore unforgeable. It never looked at
 * `block.field` — the array actually stored, served and rendered — so that array was
 * unconstrained by consensus while its digest was not.
 *
 * This matters less for money than for the claim. The project's sharpest sentence is
 * that the picture is not a dashboard over the chain, it partly *is* the chain. For the
 * digests that was true. For the arrays a node serves at `/wave/tip` and the UI draws
 * in `LedgerField.tsx`, it was not. Comparing them costs nothing, because the
 * recomputation is already being done to check the digest.
 */
export function assertFieldWitnessesBodyMatch(
  claimed: readonly FieldWitness[] | undefined,
  tipIndex: number,
  priorColors: readonly string[],
): void {
  const expected = buildFieldWitnesses(tipIndex, priorColors);
  const claimedList = claimed ?? [];
  if (claimedList.length !== expected.length) {
    throw new Error(
      `field witness count mismatch at tip ${tipIndex}: carried ${claimedList.length}, ` +
        `state implies ${expected.length}`,
    );
  }
  // Canonical form is the digest's own preimage, so "equal" here means exactly what
  // "equal" means to the commitment. Two notions of equality would be a second rule.
  if (computeFieldDigest(claimedList) !== computeFieldDigest(expected)) {
    throw new Error(
      `field witnesses carried by tip ${tipIndex} do not match the ones its state implies`,
    );
  }
}

export function assertFieldWitnessesMatch(
  claimed: string,
  tipIndex: number,
  priorColors: readonly string[],
): void {
  const expected = computeFieldDigest(buildFieldWitnesses(tipIndex, priorColors));
  if (claimed !== expected) {
    throw new Error(
      `fieldDigest mismatch: tip ${tipIndex} claimed ${claimed.slice(0, 12)}… expected ${expected.slice(0, 12)}… (sphere lock)`,
    );
  }
}

/** Prior-color hex list for tips built from ledger pixels. */
export function priorFieldColors(
  pixels: readonly { color: { r: number; g: number; b: number } }[],
): string[] {
  return pixels.map((p) => colorToFieldHex(p.color));
}

/** Tip lattice coord — for explorers / Billboard. */
export function tipLatticeCoord(tipIndex: number) {
  return indexToLattice(tipIndex);
}

export function fieldWitnessThesis(): string {
  return (
    "FieldWitness invents tip custody as a sphere combination lock: lattice Chebyshev-3 " +
    "peers, distance, opacity ∈ {opaque, translucent, lit}, opacity-weighted neighbor blend; " +
    "light-proof binds fieldDigest; acceptPixel recomputes and rejects mismatch. Not a rename " +
    "of prevHash — verification, continuity of the scene, custody of the tip."
  );
}

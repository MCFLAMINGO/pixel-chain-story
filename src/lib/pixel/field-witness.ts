/**
 * FieldWitness — sphere combination lock for tip custody.
 *
 * Invent (not rename of prevHash): tip light-proof message includes fieldDigest
 * over peer indices at Chebyshev distance ≤ FIELD_MAX_DISTANCE, with opacity
 * ∈ {opaque, translucent, lit}. acceptPixel recomputes and rejects mismatch.
 *
 * Continuity of the scene, not simile alone.
 */

import { createHash } from "node:crypto";

export const FIELD_MAX_DISTANCE = 2;

/** Opaque = no color; translucent = attenuated; lit = full peer color. */
export type FieldOpacity = "opaque" | "translucent" | "lit";

export type FieldWitness = {
  peerIndex: number;
  distance: number;
  opacity: FieldOpacity;
  /** Empty string when opaque; peer color `#rrggbb` otherwise. */
  color: string;
};

export function opacityForDistance(distance: number): FieldOpacity {
  if (distance <= 0) return "lit";
  if (distance === 1) return "translucent";
  return "opaque";
}

/** Relative weight of peer color contribution (spec table). */
export function opacityWeight(opacity: FieldOpacity): number {
  switch (opacity) {
    case "lit":
      return 1;
    case "translucent":
      return 0.5;
    case "opaque":
      return 0;
  }
}

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

function chebyshevDistance(a: number, b: number): number {
  return Math.abs(a - b);
}

/**
 * Build ordered peer witnesses for tip at `tipIndex` from prior chain colors.
 * `priorColors[i]` is the `#rrggbb` (or "") of pixel at index i (0..tipIndex-1).
 */
export function buildFieldWitnesses(
  tipIndex: number,
  priorColors: readonly string[],
): FieldWitness[] {
  if (tipIndex < 0) {
    throw new Error("tipIndex must be ≥ 0");
  }
  if (priorColors.length !== tipIndex) {
    throw new Error(`priorColors length ${priorColors.length} must equal tipIndex ${tipIndex}`);
  }

  const out: FieldWitness[] = [];
  const lo = Math.max(0, tipIndex - FIELD_MAX_DISTANCE);
  const hi = tipIndex - 1;
  for (let peerIndex = lo; peerIndex <= hi; peerIndex++) {
    const distance = chebyshevDistance(tipIndex, peerIndex);
    const opacity = opacityForDistance(distance);
    const color = opacity === "opaque" ? "" : priorColors[peerIndex]!;
    out.push({ peerIndex, distance, opacity, color });
  }
  return out;
}

/** Canonical digest bound into tip light-proof message. */
export function computeFieldDigest(witnesses: readonly FieldWitness[]): string {
  const canonical = witnesses
    .slice()
    .sort((a, b) => a.peerIndex - b.peerIndex)
    .map((w) => `${w.peerIndex}:${w.distance}:${w.opacity}:${w.color.toLowerCase()}`)
    .join("|");
  return createHash("sha512").update(`field|${canonical}`).digest("hex");
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

export function fieldWitnessThesis(): string {
  return (
    "FieldWitness invents tip custody as a sphere combination lock: peer indices, " +
    "distance, opacity ∈ {opaque, translucent, lit}; light-proof binds fieldDigest; " +
    "acceptPixel recomputes and rejects mismatch. Not a rename of prevHash — " +
    "verification, continuity of the scene, custody of the tip."
  );
}

/**
 * Lattice — spatial coordinates behind FieldWitness.
 *
 * S1 invent: deterministic index→(x,y,z) packing + Chebyshev-3 distance
 * and opacity-weighted neighbor blend. Tip custody still lives in
 * field-witness / PoLS — this module is the geometry + blend meat.
 *
 * Not a disconnected voxel toy. Wrong blend must fail acceptBlock.
 */

export type LatticeCoord = { x: number; y: number; z: number };

export type LatticeOpacity = "opaque" | "translucent" | "lit";

/**
 * Pack sequential tip indices onto a growing square on z=0 (S1 slice).
 * Side length grows with √(n+1) so early tips stay clustered — neighbor
 * reactions appear within a few illuminations (MVP demo property).
 */
export function indexToLattice(index: number): LatticeCoord {
  if (index < 0 || !Number.isInteger(index)) {
    throw new Error("lattice index must be a non-negative integer");
  }
  const side = Math.max(1, Math.ceil(Math.sqrt(index + 1)));
  return {
    x: index % side,
    y: Math.floor(index / side),
    z: 0,
  };
}

/** Chebyshev distance in 3-space (true sphere metric for the lock). */
export function chebyshev3(a: LatticeCoord, b: LatticeCoord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

export function formatCoord(c: LatticeCoord): string {
  return `${c.x},${c.y},${c.z}`;
}

export function latticeOpacityForDistance(distance: number): LatticeOpacity {
  if (distance <= 0) return "lit";
  if (distance === 1) return "translucent";
  return "opaque";
}

export function latticeOpacityWeight(opacity: LatticeOpacity): number {
  switch (opacity) {
    case "lit":
      return 1;
    case "translucent":
      return 0.5;
    case "opaque":
      return 0;
  }
}

export type LatticePeer = {
  peerIndex: number;
  coord: LatticeCoord;
  distance: number;
  opacity: LatticeOpacity;
  color: string;
  weight: number;
};

/** Prior peers within Chebyshev ≤ maxDistance of tip (lattice space). */
export function latticePeersInSphere(
  tipIndex: number,
  priorColors: readonly string[],
  maxDistance: number,
): LatticePeer[] {
  if (tipIndex < 0) throw new Error("tipIndex must be ≥ 0");
  if (priorColors.length !== tipIndex) {
    throw new Error(`priorColors length ${priorColors.length} must equal tipIndex ${tipIndex}`);
  }
  const tip = indexToLattice(tipIndex);
  const out: LatticePeer[] = [];
  for (let peerIndex = 0; peerIndex < tipIndex; peerIndex++) {
    const coord = indexToLattice(peerIndex);
    const distance = chebyshev3(tip, coord);
    if (distance > maxDistance) continue;
    const opacity = latticeOpacityForDistance(distance);
    const weight = latticeOpacityWeight(opacity);
    const color = opacity === "opaque" ? "" : priorColors[peerIndex]!;
    out.push({ peerIndex, coord, distance, opacity, color, weight });
  }
  out.sort((a, b) => a.peerIndex - b.peerIndex);
  return out;
}

function parseRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || hex[0] !== "#" || hex.length < 7) return null;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  return { r, g, b };
}

/**
 * Opacity-weighted RGB blend of peer colors (neighbor reaction meat).
 * Opaque peers contribute 0. Empty sphere → "".
 */
export function neighborBlendHex(peers: readonly { weight: number; color: string }[]): string {
  let wr = 0;
  let wg = 0;
  let wb = 0;
  let wsum = 0;
  for (const p of peers) {
    if (p.weight <= 0 || !p.color) continue;
    const rgb = parseRgb(p.color);
    if (!rgb) continue;
    wr += rgb.r * p.weight;
    wg += rgb.g * p.weight;
    wb += rgb.b * p.weight;
    wsum += p.weight;
  }
  if (wsum <= 0) return "";
  const r = Math.max(0, Math.min(255, Math.round(wr / wsum)));
  const g = Math.max(0, Math.min(255, Math.round(wg / wsum)));
  const b = Math.max(0, Math.min(255, Math.round(wb / wsum)));
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

/**
 * Simple amplitude map (lab preview). Tip consensus uses `wave.ts` / waveDigest.
 */
export function leadWaveAmplitudes(
  leadIndex: number,
  occupied: readonly number[],
  strength: number,
  radius: number,
): Map<number, number> {
  const lead = indexToLattice(leadIndex);
  const out = new Map<number, number>();
  for (const i of occupied) {
    const d = chebyshev3(lead, indexToLattice(i));
    if (d > radius) continue;
    const decay = Math.max(0.05, 1 - d / Math.max(1, radius));
    out.set(i, strength * decay);
  }
  return out;
}

export function latticeThesis(): string {
  return (
    "Lattice invents spatial coords and Chebyshev-3 neighbor metric for tip FieldWitness: " +
    "index→(x,y,z), opacity-weighted blend in fieldDigest. Not a rename of a game voxel engine — " +
    "verification of the scene on the tip. S1 packing is a z=0 slice; deeper z and waves are later phases."
  );
}

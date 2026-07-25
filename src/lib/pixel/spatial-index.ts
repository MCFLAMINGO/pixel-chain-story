/**
 * Spatial occupancy index — hash grid over lattice cells (SPATIAL S4).
 *
 * Local acceleration for neighbor queries. Not consensus truth:
 * peers still recompute waveDigest / spatialRoot / fieldDigest from tip inputs.
 * Octree deferred until benches demand it (S5).
 */

import { chebyshev3, formatCoord, indexToLattice, type LatticeCoord } from "./lattice";

/** Integer lattice → one cell per unit cube (hash grid cell size = 1). */
export const SPATIAL_GRID_CELL_SIZE = 1;

export type OccupancyIndex = {
  /** Tip inclusive — indices 0..tipIndex occupy the lattice */
  tipIndex: number;
  cellSize: number;
  /** coord key "x,y,z" → pixel index */
  byCoord: Map<string, number>;
  /** bucket "bx,by,bz" → pixel indices in that grid cell */
  buckets: Map<string, number[]>;
};

function bucketKey(c: LatticeCoord, cellSize: number): string {
  const bx = Math.floor(c.x / cellSize);
  const by = Math.floor(c.y / cellSize);
  const bz = Math.floor(c.z / cellSize);
  return `${bx},${by},${bz}`;
}

/** Build occupancy for illuminated tip indices 0..tipIndex (all tips occupy). */
export function buildOccupancyIndex(
  tipIndex: number,
  cellSize = SPATIAL_GRID_CELL_SIZE,
): OccupancyIndex {
  if (tipIndex < 0 || !Number.isInteger(tipIndex)) {
    throw new Error("tipIndex must be a non-negative integer");
  }
  if (cellSize < 1 || !Number.isInteger(cellSize)) {
    throw new Error("cellSize must be a positive integer");
  }
  const byCoord = new Map<string, number>();
  const buckets = new Map<string, number[]>();
  for (let i = 0; i <= tipIndex; i++) {
    const coord = indexToLattice(i);
    const ck = formatCoord(coord);
    byCoord.set(ck, i);
    const bk = bucketKey(coord, cellSize);
    const list = buckets.get(bk) ?? [];
    list.push(i);
    buckets.set(bk, list);
  }
  return { tipIndex, cellSize, byCoord, buckets };
}

export function indexGet(index: OccupancyIndex, coord: LatticeCoord): number | undefined {
  return index.byCoord.get(formatCoord(coord));
}

/** Six-face neighbors that are occupied (lattice adjacency). */
export function indexNeighbors6(index: OccupancyIndex, coord: LatticeCoord): number[] {
  const deltas: LatticeCoord[] = [
    { x: coord.x + 1, y: coord.y, z: coord.z },
    { x: coord.x - 1, y: coord.y, z: coord.z },
    { x: coord.x, y: coord.y + 1, z: coord.z },
    { x: coord.x, y: coord.y - 1, z: coord.z },
    { x: coord.x, y: coord.y, z: coord.z + 1 },
    { x: coord.x, y: coord.y, z: coord.z - 1 },
  ];
  const out: number[] = [];
  for (const d of deltas) {
    const idx = indexGet(index, d);
    if (idx !== undefined) out.push(idx);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Occupied indices within Chebyshev ≤ radius of center.
 * Scans neighboring buckets (cellSize=1 ⇒ exact neighborhood).
 */
export function queryChebyshev(
  index: OccupancyIndex,
  center: LatticeCoord,
  radius: number,
): number[] {
  if (radius < 0) throw new Error("radius must be ≥ 0");
  const cellSize = index.cellSize;
  const bRadius = Math.ceil(radius / cellSize) + 1;
  const cbx = Math.floor(center.x / cellSize);
  const cby = Math.floor(center.y / cellSize);
  const cbz = Math.floor(center.z / cellSize);
  const out: number[] = [];
  for (let dx = -bRadius; dx <= bRadius; dx++) {
    for (let dy = -bRadius; dy <= bRadius; dy++) {
      for (let dz = -bRadius; dz <= bRadius; dz++) {
        const list = index.buckets.get(`${cbx + dx},${cby + dy},${cbz + dz}`);
        if (!list) continue;
        for (const idx of list) {
          const c = indexToLattice(idx);
          if (chebyshev3(center, c) <= radius) out.push(idx);
        }
      }
    }
  }
  return out.sort((a, b) => a - b);
}

/** Naive occupancy map — equivalence oracle for selftests. */
export function naiveOccupancyMap(tipIndex: number): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i <= tipIndex; i++) {
    map.set(formatCoord(indexToLattice(i)), i);
  }
  return map;
}

export function spatialIndexThesis(): string {
  return (
    "Spatial index invents a tip-equivalent hash grid over occupied lattice cells for " +
    "neighbor queries. Local acceleration only — not octree mainnet, not a second consensus " +
    "truth; waveDigest / spatialRoot still recompute from tip inputs."
  );
}

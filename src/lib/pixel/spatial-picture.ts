/**
 * Spatial picture — sparse occupancy Merkle (SPATIAL S3).
 *
 * Illuminated lattice cells form a sorted leaf set; spatialRoot commits the
 * verifiable picture. Light clients prove “cell lit” without the full UTXO map.
 *
 * Bound into PoLS as |spatial=<spatialRoot>. Wrong occupancy ⇒ reject.
 * Not a matplotlib toy — tip-verifiable picture fragment.
 */

import { sha512Hex, sha512SyncHex, type Hex } from "./crypto";
import { formatCoord, indexToLattice, type LatticeCoord } from "./lattice";
import { colorToFieldHex } from "./field-witness";

export type OccupiedCell = {
  index: number;
  coord: LatticeCoord;
  colorHex: string;
  illuminated: boolean;
};

export type SpatialPicture = {
  cells: OccupiedCell[];
  spatialRoot: Hex;
};

export type IlluminatedCellProof = {
  index: number;
  coord: LatticeCoord;
  colorHex: string;
  illuminated: boolean;
  leafIndex: number;
  siblings: Hex[];
  spatialRoot: Hex;
};

function cellKey(c: LatticeCoord, index: number): string {
  return `${formatCoord(c)}#${index}`;
}

/** Stable sort: x,y,z then index. */
export function sortOccupied(cells: readonly OccupiedCell[]): OccupiedCell[] {
  return cells.slice().sort((a, b) => {
    if (a.coord.x !== b.coord.x) return a.coord.x - b.coord.x;
    if (a.coord.y !== b.coord.y) return a.coord.y - b.coord.y;
    if (a.coord.z !== b.coord.z) return a.coord.z - b.coord.z;
    return a.index - b.index;
  });
}

export function occupancyLeaf(cell: OccupiedCell): Promise<Hex> {
  const lit = cell.illuminated ? "1" : "0";
  return sha512Hex(
    `spatial-cell|${formatCoord(cell.coord)}|${cell.index}|${cell.colorHex.toLowerCase()}|${lit}`,
  );
}

async function merkleParent(left: Hex, right: Hex): Promise<Hex> {
  return sha512Hex(`${left}|${right}`);
}

/** Empty picture sentinel — genesis before any light still has a root. */
export async function emptySpatialRoot(): Promise<Hex> {
  return sha512Hex("empty-spatial-root");
}

/**
 * Build sparse occupancy from tip pixels (0..tip inclusive).
 * Only illuminated cells enter the picture (void stays dark).
 */
export function buildOccupiedCells(
  pixels: readonly {
    index: number;
    illuminated: boolean;
    color: { r: number; g: number; b: number };
  }[],
): OccupiedCell[] {
  const cells: OccupiedCell[] = [];
  for (const p of pixels) {
    if (!p.illuminated) continue;
    cells.push({
      index: p.index,
      coord: indexToLattice(p.index),
      colorHex: colorToFieldHex(p.color),
      illuminated: true,
    });
  }
  return sortOccupied(cells);
}

export async function computeSpatialRoot(cells: readonly OccupiedCell[]): Promise<Hex> {
  const sorted = sortOccupied(cells);
  if (sorted.length === 0) return emptySpatialRoot();
  let layer: Hex[] = [];
  for (const c of sorted) {
    layer.push(await occupancyLeaf(c));
  }
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left;
      next.push(await merkleParent(left, right));
    }
    layer = next;
  }
  return layer[0]!;
}

export async function buildSpatialPicture(
  pixels: readonly {
    index: number;
    illuminated: boolean;
    color: { r: number; g: number; b: number };
  }[],
): Promise<SpatialPicture> {
  const cells = buildOccupiedCells(pixels);
  const spatialRoot = await computeSpatialRoot(cells);
  return { cells, spatialRoot };
}

/** Merkle proof that cell at pixel index is illuminated in the tip picture. */
export async function proveIlluminatedCell(
  pixels: readonly {
    index: number;
    illuminated: boolean;
    color: { r: number; g: number; b: number };
  }[],
  index: number,
): Promise<IlluminatedCellProof | null> {
  const cells = buildOccupiedCells(pixels);
  const leafIndex = cells.findIndex((c) => c.index === index);
  if (leafIndex < 0) return null;
  const cell = cells[leafIndex]!;

  let layer: Hex[] = [];
  for (const c of cells) layer.push(await occupancyLeaf(c));

  const siblings: Hex[] = [];
  let idx = leafIndex;
  while (layer.length > 1) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    const sibling = layer[siblingIdx] ?? layer[idx]!;
    siblings.push(sibling);
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left;
      next.push(await merkleParent(left, right));
    }
    layer = next;
    idx = Math.floor(idx / 2);
  }

  return {
    index: cell.index,
    coord: cell.coord,
    colorHex: cell.colorHex,
    illuminated: cell.illuminated,
    leafIndex,
    siblings,
    spatialRoot: layer[0]!,
  };
}

export async function verifyIlluminatedCellProof(proof: IlluminatedCellProof): Promise<boolean> {
  if (!proof.illuminated || proof.leafIndex < 0) return false;
  let hash = await occupancyLeaf({
    index: proof.index,
    coord: proof.coord,
    colorHex: proof.colorHex,
    illuminated: proof.illuminated,
  });
  let idx = proof.leafIndex;
  for (const sibling of proof.siblings) {
    hash = idx % 2 === 0 ? await merkleParent(hash, sibling) : await merkleParent(sibling, hash);
    idx = Math.floor(idx / 2);
  }
  return hash === proof.spatialRoot;
}
export function assertSpatialRootMatch(claimed: string, expected: string, tipIndex: number): void {
  if (claimed !== expected) {
    throw new Error(
      `spatialRoot mismatch: tip ${tipIndex} claimed ${claimed.slice(0, 12)}… expected ${expected.slice(0, 12)}… (picture)`,
    );
  }
}

/** Human / RPC snapshot — illuminated picture only. */
export function pictureSnapshot(picture: SpatialPicture): {
  spatialRoot: string;
  cells: Array<{
    index: number;
    x: number;
    y: number;
    z: number;
    color: string;
    key: string;
  }>;
} {
  return {
    spatialRoot: picture.spatialRoot,
    cells: picture.cells.map((c) => ({
      index: c.index,
      x: c.coord.x,
      y: c.coord.y,
      z: c.coord.z,
      color: c.colorHex,
      key: cellKey(c.coord, c.index),
    })),
  };
}

export function spatialPictureThesis(): string {
  return (
    "Spatial picture invents a sparse occupancy Merkle over illuminated lattice cells: " +
    "spatialRoot in PoLS, light-client proofs that a cell is lit. Verifiable picture fragment — " +
    "not a matplotlib demo, not a rename of a game voxel engine."
  );
}

/** Sync helper — digest of picture for logging. */
export function pictureDigestShort(root: string): string {
  return sha512SyncHex(root).slice(0, 16);
}

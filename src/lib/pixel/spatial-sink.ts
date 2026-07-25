/**
 * Spatial sink — adapter for Three.js / web viz (SPATIAL S5).
 *
 * Pure data mapping from tip spatial snapshot + optional wave hits → scene
 * props. Never a consensus source. Peers still recompute digests on accept.
 */

import { indexToLattice } from "./lattice";
import { pictureSnapshot, type SpatialPicture } from "./spatial-picture";
import type { WaveHit } from "./wave";

export type SpatialSinkCell = {
  index: number;
  x: number;
  y: number;
  z: number;
  color: string;
  key: string;
};

export type SpatialSinkWaveHit = {
  cellIndex: number;
  hop: number;
  amplitudeMilli: number;
  leadIndex: number;
  x: number;
  y: number;
  z: number;
};

export type SpatialSinkScene = {
  spatialRoot: string;
  waveDigest?: string;
  tipIndex?: number;
  tipHash?: string;
  cells: SpatialSinkCell[];
  waveHits: SpatialSinkWaveHit[];
  /** Always true — UI sink doctrine flag for callers/tests */
  uiSinkOnly: true;
};

/** Build scene from RPC snapshot + optional /wave/tip payload. */
export function buildSpatialSinkScene(params: {
  snapshot: {
    spatialRoot: string;
    cells: Array<{
      index: number;
      x: number;
      y: number;
      z: number;
      color: string;
      key: string;
    }>;
  };
  wave?: {
    tipIndex?: number;
    tipHash?: string;
    waveDigest?: string;
    hits?: WaveHit[];
  } | null;
}): SpatialSinkScene {
  const cells: SpatialSinkCell[] = params.snapshot.cells.map((c) => ({
    index: c.index,
    x: c.x,
    y: c.y,
    z: c.z,
    color: c.color.startsWith("#") ? c.color : `#${c.color}`,
    key: c.key,
  }));
  const waveHits: SpatialSinkWaveHit[] = (params.wave?.hits ?? []).map((h) => {
    const coord = indexToLattice(h.cellIndex);
    return {
      cellIndex: h.cellIndex,
      hop: h.hop,
      amplitudeMilli: h.amplitudeMilli,
      leadIndex: h.leadIndex,
      x: coord.x,
      y: coord.y,
      z: coord.z,
    };
  });
  return {
    spatialRoot: params.snapshot.spatialRoot,
    waveDigest: params.wave?.waveDigest,
    tipIndex: params.wave?.tipIndex,
    tipHash: params.wave?.tipHash,
    cells,
    waveHits,
    uiSinkOnly: true,
  };
}

/** Local tip → scene (lab without RPC). */
export async function buildSpatialSinkFromPicture(
  picture: SpatialPicture,
  opts?: {
    waveDigest?: string;
    tipIndex?: number;
    tipHash?: string;
    hits?: WaveHit[];
  },
): Promise<SpatialSinkScene> {
  return buildSpatialSinkScene({
    snapshot: pictureSnapshot(picture),
    wave: opts
      ? {
          tipIndex: opts.tipIndex,
          tipHash: opts.tipHash,
          waveDigest: opts.waveDigest,
          hits: opts.hits,
        }
      : null,
  });
}

export function spatialSinkThesis(): string {
  return (
    "Spatial sink invents a Three.js / web viz of tip illuminated cells and wave hits " +
    "as a UI sink only — never consensus truth. Digests (spatialRoot, waveDigest) are " +
    "displayed, not authored. Replaces matplotlib demos without inventing a second ledger."
  );
}

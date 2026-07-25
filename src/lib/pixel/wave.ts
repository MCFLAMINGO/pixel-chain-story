/**
 * Lead wave — tip-bound neighbor reaction (SPATIAL S2).
 *
 * A tip illumination emits a deterministic multi-hop wave over the lattice.
 * Peers recompute waveDigest; mismatch ⇒ reject (same plane as FieldWitness).
 *
 * Collision: when prior leads leave residue on overlapping cells, contributions
 * sort by (leadIndex, leadTipHash) then fold — never “last writer wins” by clock.
 *
 * Seed uses prevHash|sequence|merkleRoot (available before tip hash).
 * Not UI glitter. Not a disconnected voxel sim.
 */

import { sha512Sync, sha512SyncHex } from "./crypto";
import { chebyshev3, indexToLattice, type LatticeCoord } from "./lattice";
import { buildOccupancyIndex, indexGet } from "./spatial-index";
import { WAVE_DAMPING } from "./wave-rules";

/** Multi-hop radius from the lead (Chebyshev). */
export const WAVE_MAX_HOPS = 2;

/** How many prior tips may leave residue on the current tip’s sphere. */
export const WAVE_LOOKBACK = 8;

export type WaveHit = {
  cellIndex: number;
  hop: number;
  /** Fixed-point milli-amplitude (0…10000) */
  amplitudeMilli: number;
  leadIndex: number;
};

export type WaveField = {
  hits: WaveHit[];
  waveDigest: string;
};

function neighbors6(c: LatticeCoord): LatticeCoord[] {
  return [
    { x: c.x + 1, y: c.y, z: c.z },
    { x: c.x - 1, y: c.y, z: c.z },
    { x: c.x, y: c.y + 1, z: c.z },
    { x: c.x, y: c.y - 1, z: c.z },
    { x: c.x, y: c.y, z: c.z + 1 },
    { x: c.x, y: c.y, z: c.z - 1 },
  ];
}

/**
 * Outgoing BFS wave from a lead through occupied lattice cells.
 * Amplitude decays by WAVE_DAMPING per hop; only occupied cells are hits.
 * Uses hash-grid occupancy index (tip-equivalent; not a second truth).
 */
export function outgoingWaveHits(
  leadIndex: number,
  tipIndex: number,
  seed: string,
  maxHops = WAVE_MAX_HOPS,
): WaveHit[] {
  if (leadIndex < 0 || leadIndex > tipIndex) {
    throw new Error("leadIndex out of range");
  }
  const occ = buildOccupancyIndex(tipIndex);
  const leadCoord = indexToLattice(leadIndex);
  const base = sha512Sync(`wave-seed|${seed}|lead=${leadIndex}`);
  const strengthMilli = 2000 + (base[0]! << 8) + base[1]!; // 2000…67535 → clamp later
  const startAmp = Math.min(10000, strengthMilli);

  const hits: WaveHit[] = [];
  const seen = new Set<number>();
  const queue: Array<{ index: number; hop: number; amp: number }> = [
    { index: leadIndex, hop: 0, amp: startAmp },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (seen.has(cur.index)) continue;
    seen.add(cur.index);
    hits.push({
      cellIndex: cur.index,
      hop: cur.hop,
      amplitudeMilli: Math.max(0, Math.min(10000, Math.round(cur.amp))),
      leadIndex,
    });
    if (cur.hop >= maxHops) continue;
    const c = indexToLattice(cur.index);
    for (const n of neighbors6(c)) {
      // Stay inside Chebyshev ball from lead (sphere lock alignment)
      if (chebyshev3(leadCoord, n) > maxHops) continue;
      const idx = indexGet(occ, n);
      if (idx === undefined || seen.has(idx)) continue;
      queue.push({
        index: idx,
        hop: cur.hop + 1,
        amp: cur.amp * WAVE_DAMPING,
      });
    }
  }

  hits.sort((a, b) =>
    a.cellIndex !== b.cellIndex
      ? a.cellIndex - b.cellIndex
      : a.leadIndex !== b.leadIndex
        ? a.leadIndex - b.leadIndex
        : a.hop - b.hop,
  );
  return hits;
}

/**
 * Fold colliding hits on the same cell: sort by (leadIndex, leadHash), then
 * mix amplitudes deterministically (not wall-clock order).
 */
export function resolveWaveCollisions(
  hits: WaveHit[],
  leadHashes: ReadonlyMap<number, string>,
): WaveHit[] {
  const byCell = new Map<number, WaveHit[]>();
  for (const h of hits) {
    const list = byCell.get(h.cellIndex) ?? [];
    list.push(h);
    byCell.set(h.cellIndex, list);
  }
  const out: WaveHit[] = [];
  for (const [cellIndex, list] of [...byCell.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => {
      if (a.leadIndex !== b.leadIndex) return a.leadIndex - b.leadIndex;
      const ha = leadHashes.get(a.leadIndex) ?? "";
      const hb = leadHashes.get(b.leadIndex) ?? "";
      return ha < hb ? -1 : ha > hb ? 1 : a.hop - b.hop;
    });
    let milli = 0;
    let hop = list[0]!.hop;
    let leadIndex = list[0]!.leadIndex;
    for (const h of list) {
      // Polynomial fold — order-sensitive, collision-stable
      milli = (milli * 31 + h.amplitudeMilli) % 10007;
      hop = Math.min(hop, h.hop);
      leadIndex = h.leadIndex; // last in sort order (highest lead after hash tie-break)
    }
    // Prefer earliest lead as attributed lead after fold
    leadIndex = list[0]!.leadIndex;
    out.push({
      cellIndex,
      hop,
      amplitudeMilli: milli,
      leadIndex,
    });
  }
  return out;
}

export function computeWaveDigest(hits: readonly WaveHit[]): string {
  const canonical = hits
    .slice()
    .sort((a, b) =>
      a.cellIndex !== b.cellIndex
        ? a.cellIndex - b.cellIndex
        : a.leadIndex !== b.leadIndex
          ? a.leadIndex - b.leadIndex
          : a.hop - b.hop,
    )
    .map((h) => `${h.cellIndex}:${h.hop}:${h.amplitudeMilli}:${h.leadIndex}`)
    .join("|");
  return sha512SyncHex(`wave|v1|${canonical}`);
}

/**
 * Full tip wave field: outgoing from tip + residue from lookback leads,
 * collision-resolved, digested.
 */
export function computeTipWaveField(params: {
  tipIndex: number;
  sequence: number;
  prevHash: string;
  merkleRoot: string;
  /** tip hash for each prior index 0..tipIndex-1 (genesis hash for 0) */
  priorTipHashes: readonly string[];
}): WaveField {
  const { tipIndex, sequence, prevHash, merkleRoot, priorTipHashes } = params;
  if (priorTipHashes.length !== tipIndex) {
    throw new Error(
      `priorTipHashes length ${priorTipHashes.length} must equal tipIndex ${tipIndex}`,
    );
  }

  const seed = `${prevHash}|${sequence}|${merkleRoot}`;
  const leadHashes = new Map<number, string>();
  for (let i = 0; i < tipIndex; i++) {
    leadHashes.set(i, priorTipHashes[i]!);
  }
  // Tip lead uses seed commitment (hash not yet finalized)
  leadHashes.set(tipIndex, sha512SyncHex(`tip-lead|${seed}`));

  const raw: WaveHit[] = [];
  // Outgoing from this tip
  raw.push(...outgoingWaveHits(tipIndex, tipIndex, seed));

  // Residue from recent prior leads (collision domain)
  const lo = Math.max(0, tipIndex - WAVE_LOOKBACK);
  for (let lead = lo; lead < tipIndex; lead++) {
    const leadSeed = `${priorTipHashes[lead]}|${lead}|residue`;
    raw.push(...outgoingWaveHits(lead, tipIndex, leadSeed));
  }

  const hits = resolveWaveCollisions(raw, leadHashes);
  return { hits, waveDigest: computeWaveDigest(hits) };
}

export function assertWaveDigestMatch(
  claimed: string,
  params: {
    tipIndex: number;
    sequence: number;
    prevHash: string;
    merkleRoot: string;
    priorTipHashes: readonly string[];
  },
): void {
  const { waveDigest } = computeTipWaveField(params);
  if (claimed !== waveDigest) {
    throw new Error(
      `waveDigest mismatch: tip ${params.tipIndex} claimed ${claimed.slice(0, 12)}… expected ${waveDigest.slice(0, 12)}… (lead wave)`,
    );
  }
}

export function waveThesis(): string {
  return (
    "Lead wave invents tip-bound lattice propagation: multi-hop neighbor hits, " +
    `damping=${WAVE_DAMPING} (named lab rule in amplitudes), ` +
    "collision fold by (leadIndex, tipHash), waveDigest in PoLS. Peers recompute and reject " +
    "tampered waves. Not UI glitter — verification of the scene on the tip."
  );
}

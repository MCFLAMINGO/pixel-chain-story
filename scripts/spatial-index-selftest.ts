/**
 * Spatial hash-grid index (SPATIAL S4) — tip-equivalent occupancy queries.
 * Wave digests unchanged vs prior path; index is not consensus truth.
 * bun run test:spatial-index
 */
import {
  buildOccupancyIndex,
  computeTipWaveField,
  createGenesis,
  generateLightKeypair,
  indexGet,
  indexNeighbors6,
  indexToLattice,
  naiveOccupancyMap,
  proposeTransfer,
  queryChebyshev,
  sequenceBlock,
  spatialIndexThesis,
  WAVE_DAMPING,
  formatCoord,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ SPATIAL INDEX (S4) ═══\n");

  if (!spatialIndexThesis().includes("hash grid")) throw new Error("thesis");
  if (!/not a second consensus/i.test(spatialIndexThesis())) throw new Error("thesis invent");
  console.log("▸ thesis ✓");

  for (const tip of [0, 1, 3, 8, 15]) {
    const idx = buildOccupancyIndex(tip);
    const naive = naiveOccupancyMap(tip);
    if (idx.byCoord.size !== naive.size) throw new Error(`size tip=${tip}`);
    for (const [k, v] of naive) {
      if (idx.byCoord.get(k) !== v) throw new Error(`mismatch ${k}`);
    }
    const c = indexToLattice(tip);
    if (indexGet(idx, c) !== tip) throw new Error("get tip");
    const sphere = queryChebyshev(idx, c, 2);
    for (const i of sphere) {
      // every returned index must be within radius
      const d = Math.max(
        Math.abs(indexToLattice(i).x - c.x),
        Math.abs(indexToLattice(i).y - c.y),
        Math.abs(indexToLattice(i).z - c.z),
      );
      if (d > 2) throw new Error("chebyshev leak");
    }
  }
  console.log("▸ occupancy ≡ naive for tips 0..15 ✓");

  const idx3 = buildOccupancyIndex(3);
  const n0 = indexNeighbors6(idx3, indexToLattice(0));
  if (!n0.includes(1)) throw new Error("expected neighbor 1 of 0 on packing");
  console.log("▸ neighbors6 ✓", formatCoord(indexToLattice(0)), "→", n0.join(","));

  // Tip wave digests still recompute (index is acceleration only)
  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  let chain = await createGenesis(alice);
  for (let i = 0; i < 4; i++) {
    const { state: pending } = await proposeTransfer(
      chain,
      alice,
      [{ amount: 1, address: bob.address }],
      { description: `idx grow ${i}`, recipientLabel: "@bob" },
    );
    chain = await sequenceBlock(pending, alice);
  }
  const tip = chain.pixels[chain.pixels.length - 1]!;
  const field = computeTipWaveField({
    tipIndex: tip.index,
    sequence: tip.sequence,
    prevHash: tip.prevHash,
    merkleRoot: tip.merkleRoot,
    priorTipHashes: chain.pixels.slice(0, -1).map((p) => p.hash),
  });
  if (field.waveDigest !== tip.lightProof.waveDigest) {
    throw new Error("waveDigest drift after hash-grid path");
  }
  if (WAVE_DAMPING !== 0.55) throw new Error("damping constant drift");
  console.log("▸ waveDigest tip-equivalent with hash grid ✓ damping", WAVE_DAMPING);

  console.log("\n═══ PASS — spatial index S4 ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

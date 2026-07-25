/**
 * Lead wave (SPATIAL S2) — tip-bound multi-hop lattice propagation.
 * Collision fold stable; tampered waveDigest rejected.
 * bun run test:wave
 */
import {
  acceptBlock,
  assertWaveDigestMatch,
  computeTipWaveField,
  computeWaveDigest,
  createGenesis,
  createLightProof,
  generateLightKeypair,
  outgoingWaveHits,
  proposeTransfer,
  resolveWaveCollisions,
  sequenceBlock,
  stateFromPixels,
  verifyChain,
  waveThesis,
  WAVE_MAX_HOPS,
  type LedgerPixel,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ LEAD WAVE (S2) ═══\n");

  if (!waveThesis().includes("waveDigest")) throw new Error("thesis");
  if (!/not UI glitter/i.test(waveThesis())) throw new Error("thesis invent");
  console.log("▸ thesis ✓");

  // Outgoing multi-hop from lead 0 on a small occupancy
  const hits0 = outgoingWaveHits(0, 4, "seed-a", WAVE_MAX_HOPS);
  if (hits0.length < 2) throw new Error("wave should touch neighbors");
  if (hits0[0]!.hop !== 0 || hits0[0]!.cellIndex !== 0) throw new Error("lead first");
  const maxHop = Math.max(...hits0.map((h) => h.hop));
  if (maxHop < 1) throw new Error("need multi-hop");
  console.log("▸ outgoing multi-hop ✓ hits", hits0.length, "maxHop", maxHop);

  // Collision fold is order-stable for same set
  const mixed = [
    ...outgoingWaveHits(1, 5, "seed-b"),
    ...outgoingWaveHits(2, 5, "seed-c"),
    ...outgoingWaveHits(1, 5, "seed-b"), // duplicate lead
  ];
  const hashes = new Map([
    [1, "aa".repeat(32)],
    [2, "bb".repeat(32)],
  ]);
  const a = resolveWaveCollisions(mixed, hashes);
  const b = resolveWaveCollisions([...mixed].reverse(), hashes);
  if (computeWaveDigest(a) !== computeWaveDigest(b)) {
    throw new Error("collision fold must be order-stable");
  }
  console.log("▸ collision fold stable ✓ cells", a.length);

  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  let chain = await createGenesis(alice);
  if (!chain.pixels[0]!.lightProof.waveDigest) throw new Error("genesis waveDigest");
  assertWaveDigestMatch(chain.pixels[0]!.lightProof.waveDigest, {
    tipIndex: 0,
    sequence: 0,
    prevHash: chain.pixels[0]!.prevHash,
    merkleRoot: chain.pixels[0]!.merkleRoot,
    priorTipHashes: [],
  });
  console.log("▸ genesis wave ✓");

  for (let i = 0; i < 4; i++) {
    const { state: pending } = await proposeTransfer(
      chain,
      alice,
      [{ amount: 1, address: bob.address }],
      { description: `wave grow ${i}`, recipientLabel: "@bob" },
    );
    chain = await sequenceBlock(pending, alice);
  }
  if (!(await verifyChain(chain))) throw new Error("verify");
  const tip = chain.pixels[chain.pixels.length - 1]!;
  if (!tip.wave?.length) throw new Error("tip should store wave hits");
  const expected = computeTipWaveField({
    tipIndex: tip.index,
    sequence: tip.sequence,
    prevHash: tip.prevHash,
    merkleRoot: tip.merkleRoot,
    priorTipHashes: chain.pixels.slice(0, -1).map((p) => p.hash),
  });
  if (expected.waveDigest !== tip.lightProof.waveDigest) {
    throw new Error("waveDigest drift");
  }
  console.log("▸ tip waveDigest matches recompute ✓ hits", tip.wave.length);

  const peer = stateFromPixels(chain.pixels.slice(0, tip.index), chain.sequencers, chain.networkId);
  const accepted = await acceptBlock(peer, tip);
  if (!(await verifyChain(accepted))) throw new Error("accept failed");
  console.log("▸ acceptPixel correct wave passes ✓");

  // Tamper waveDigest
  const forgedWave = computeWaveDigest([
    { cellIndex: 0, hop: 0, amplitudeMilli: 9999, leadIndex: 0 },
  ]);
  if (forgedWave === tip.lightProof.waveDigest) throw new Error("forge collided");
  const forgedProof = await createLightProof({
    sequence: tip.sequence,
    prevHash: tip.prevHash,
    sequencer: alice,
    skipCount: tip.lightProof.skipCount ?? 0,
    electable: tip.lightProof.electable,
    fieldDigest: tip.lightProof.fieldDigest,
    waveDigest: forgedWave,
    spatialRoot: tip.lightProof.spatialRoot,
  });
  const forgedTip: LedgerPixel = { ...tip, lightProof: forgedProof };

  let rejected = false;
  try {
    await acceptBlock(peer, forgedTip);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("waveDigest mismatch") && !msg.includes("Invalid PoLS")) {
      throw new Error(`unexpected: ${msg}`);
    }
    rejected = true;
    console.log("▸ tampered wave rejected ✓", msg.slice(0, 64));
  }
  if (!rejected) throw new Error("forged waveDigest accepted");

  console.log("\n═══ PASS — lead wave S2 ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

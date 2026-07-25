/**
 * Wave partition / conflicting-wave sim (SPATIAL S4 lab).
 *
 * Divergent tips (different merkle / tip hash) fail peer accept on the other
 * branch. Forged waveDigest still fails. Lab CI — not BFT under partition.
 *
 * Honesty: tip outgoing amplitude often clamps to 10000, so waveDigest may
 * match across forks even when merkle differs; tip hash / PoLS still diverge.
 * bun run test:wave-partition
 */
import {
  acceptBlock,
  computeTipWaveField,
  createGenesis,
  createLightProof,
  generateLightKeypair,
  nextSequencerAddress,
  proposeTransfer,
  replaceTipIfBetter,
  sequenceBlock,
  stateFromPixels,
  verifyChain,
  WAVE_DAMPING,
  waveEnergyCostMilli,
  waveRulesThesis,
  waveThesis,
  type LedgerPixel,
  type LightKeypair,
  type PixelChainState,
} from "../src/lib/pixel";

function partitionThesis(): string {
  return (
    "Wave partition sim: conflicting illuminated tips fail acceptBlock on the other " +
    "branch; forged waveDigest rejects. Lab CI evidence — not instant global finality under partitions."
  );
}

function sequencerFor(chain: PixelChainState, keys: LightKeypair[]): LightKeypair {
  const elected = nextSequencerAddress(chain, 0);
  const kp = keys.find((k) => k.address === elected);
  if (!kp) throw new Error(`no key for elected ${elected}`);
  return kp;
}

async function grow(
  chain: PixelChainState,
  payer: LightKeypair,
  sequencers: LightKeypair[],
  to: string,
  n: number,
  tag: string,
): Promise<PixelChainState> {
  let c = chain;
  for (let i = 0; i < n; i++) {
    const { state: pending } = await proposeTransfer(c, payer, [{ amount: 1, address: to }], {
      description: `${tag} ${i}`,
      recipientLabel: tag,
    });
    c = await sequenceBlock(pending, sequencerFor(pending, sequencers));
  }
  return c;
}

async function main() {
  console.log("═══ WAVE PARTITION (S4 LAB) ═══\n");

  if (!partitionThesis().includes("not instant global finality")) throw new Error("thesis");
  if (!waveRulesThesis().includes("wave-rules-v1")) throw new Error("rules thesis");
  if (!waveThesis().includes(`damping=${WAVE_DAMPING}`)) throw new Error("damping in wave thesis");
  console.log("▸ thesis ✓ damping", WAVE_DAMPING);

  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  const carol = await generateLightKeypair();
  const keys = [alice];

  let shared = await createGenesis(alice);
  shared = await grow(shared, alice, keys, bob.address, 2, "prefix");
  if (!(await verifyChain(shared))) throw new Error("shared verify");
  console.log("▸ shared prefix ✓ tip", shared.pixels.length - 1);

  // Fork A
  let branchA = stateFromPixels(shared.pixels, shared.sequencers, shared.networkId);
  {
    const { state: pending } = await proposeTransfer(
      branchA,
      alice,
      [{ amount: 1, address: carol.address }],
      { description: "fork-A-wave", recipientLabel: "@carol-a" },
    );
    branchA = await sequenceBlock(pending, sequencerFor(pending, keys));
  }
  const tipA = branchA.pixels[branchA.pixels.length - 1]!;

  // Fork B — different amount/memo → different merkle / tip hash
  let branchB = stateFromPixels(shared.pixels, shared.sequencers, shared.networkId);
  {
    const { state: pending } = await proposeTransfer(
      branchB,
      alice,
      [{ amount: 2, address: carol.address }],
      { description: "fork-B-wave", recipientLabel: "@carol-b" },
    );
    branchB = await sequenceBlock(pending, sequencerFor(pending, keys));
  }
  const tipB = branchB.pixels[branchB.pixels.length - 1]!;

  if (tipA.index !== tipB.index) throw new Error("same height expected");
  if (tipA.merkleRoot === tipB.merkleRoot) throw new Error("merkle must diverge");
  if (tipA.hash === tipB.hash) throw new Error("tip hash must diverge");
  console.log(
    "▸ conflicting tips ✓ hashA",
    tipA.hash.slice(0, 12),
    "hashB",
    tipB.hash.slice(0, 12),
    tipA.lightProof.waveDigest === tipB.lightProof.waveDigest
      ? "(waveDigest may match under amp clamp — tip hash still conflicts)"
      : "(waveDigest also diverged)",
  );

  const energyA = waveEnergyCostMilli(tipA.wave ?? []);
  const energyB = waveEnergyCostMilli(tipB.wave ?? []);
  if (energyA <= 0 || energyB <= 0) throw new Error("energy cost milli");
  console.log("▸ lab energy-cost milli ✓", energyA, "vs", energyB);

  const peerPrefix = stateFromPixels(shared.pixels, shared.sequencers, shared.networkId);
  const withA = await acceptBlock(peerPrefix, tipA);
  if (!(await verifyChain(withA))) throw new Error("accept A");

  // Same-height tip B cannot extend tip A
  let heightRejected = false;
  try {
    await acceptBlock(withA, tipB);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Unexpected block height|does not link/i.test(msg)) {
      throw new Error(`unexpected: ${msg}`);
    }
    heightRejected = true;
    console.log("▸ peer on A rejects tip B height/link ✓");
  }
  if (!heightRejected) throw new Error("conflicting tip must not acceptBlock");

  // Fork-choice replace: if B wins, wave must still recompute
  const replaced = await replaceTipIfBetter(withA, tipB);
  if (replaced) {
    const tip = replaced.pixels[replaced.pixels.length - 1]!;
    const expected = computeTipWaveField({
      tipIndex: tip.index,
      sequence: tip.sequence,
      prevHash: tip.prevHash,
      merkleRoot: tip.merkleRoot,
      priorTipHashes: replaced.pixels.slice(0, -1).map((p) => p.hash),
    });
    if (expected.waveDigest !== tip.lightProof.waveDigest) {
      throw new Error("replaced tip waveDigest drift");
    }
    console.log("▸ replaceTipIfBetter kept tip-recomputable wave ✓");
  } else {
    console.log("▸ tip A preferred (fork-choice) — B not replaced ✓");
  }

  // Forged waveDigest on an otherwise-linked tip fails
  const forgedWave = computeTipWaveField({
    tipIndex: 0,
    sequence: 0,
    prevHash: "00".repeat(64),
    merkleRoot: "11".repeat(64),
    priorTipHashes: [],
  }).waveDigest;
  if (forgedWave === tipA.lightProof.waveDigest) throw new Error("forge collided");
  const forgedProof = await createLightProof({
    sequence: tipA.sequence,
    prevHash: tipA.prevHash,
    sequencer: alice,
    skipCount: tipA.lightProof.skipCount ?? 0,
    electable: tipA.lightProof.electable,
    fieldDigest: tipA.lightProof.fieldDigest,
    waveDigest: forgedWave,
    spatialRoot: tipA.lightProof.spatialRoot,
  });
  const forgedTip: LedgerPixel = { ...tipA, lightProof: forgedProof };
  let forgeRejected = false;
  try {
    await acceptBlock(peerPrefix, forgedTip);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("waveDigest mismatch") && !msg.includes("Invalid PoLS")) {
      throw new Error(`unexpected forge reject: ${msg}`);
    }
    forgeRejected = true;
    console.log("▸ forged waveDigest rejected ✓");
  }
  if (!forgeRejected) throw new Error("forged wave accepted");

  console.log("\n═══ PASS — wave partition lab S4 ═══");
  console.log(partitionThesis());
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

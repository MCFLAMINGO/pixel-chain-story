/**
 * FieldWitness — sphere combination lock (invent gate evidence).
 * Tip with wrong neighbor effects fails; correct sphere passes.
 * bun run test:field
 */
import {
  acceptBlock,
  assertFieldWitnessesMatch,
  buildFieldWitnesses,
  computeFieldDigest,
  createGenesis,
  createLightProof,
  fieldWitnessThesis,
  generateLightKeypair,
  nextSequencerAddress,
  opacityForDistance,
  opacityWeight,
  priorFieldColors,
  proposeTransfer,
  sequenceBlock,
  stateFromPixels,
  verifyChain,
  type LedgerPixel,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ FIELD WITNESS (SPHERE LOCK) ═══\n");

  const thesis = fieldWitnessThesis();
  if (!/not a rename of prevHash/i.test(thesis)) {
    throw new Error("thesis must deny prevHash rename");
  }
  if (!thesis.includes("fieldDigest")) throw new Error("thesis missing fieldDigest");
  console.log("▸ invent thesis ✓ (not a rename of prevHash)");

  if (opacityForDistance(0) !== "lit") throw new Error("d0 lit");
  if (opacityForDistance(1) !== "translucent") throw new Error("d1 translucent");
  if (opacityForDistance(2) !== "opaque") throw new Error("d2 opaque");
  if (opacityWeight("opaque") !== 0) throw new Error("opaque weight");
  if (opacityWeight("translucent") !== 0.5) throw new Error("translucent weight");
  if (opacityWeight("lit") !== 1) throw new Error("lit weight");
  console.log("▸ opacity ∈ {opaque, translucent, lit} ✓");

  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  let chain = await createGenesis(alice);
  if (!chain.pixels[0]!.lightProof.fieldDigest) throw new Error("genesis missing fieldDigest");
  if (!Array.isArray(chain.pixels[0]!.field)) throw new Error("genesis missing field[]");
  assertFieldWitnessesMatch(chain.pixels[0]!.lightProof.fieldDigest, 0, []);
  console.log("▸ genesis empty sphere ✓");

  // Grow a short chain so tip has peer neighbors (distance 1 + 2).
  for (let i = 0; i < 3; i++) {
    const { state: pending } = await proposeTransfer(
      chain,
      alice,
      [{ amount: 1, address: bob.address }],
      { description: `field grow ${i}`, recipientLabel: "@bob" },
    );
    chain = pending;
    const elected = nextSequencerAddress(chain);
    if (elected !== alice.address) throw new Error("single-sequencer expected");
    chain = await sequenceBlock(chain, alice);
  }
  if (!(await verifyChain(chain))) throw new Error("grown chain verify failed");
  const tip = chain.pixels[chain.pixels.length - 1]!;
  if (tip.index < 2) throw new Error("need tip with distance-2 peer");
  const expected = buildFieldWitnesses(tip.index, priorFieldColors(chain.pixels.slice(0, -1)));
  if (expected.length < 2) throw new Error("expected peer witnesses");
  if (computeFieldDigest(expected) !== tip.lightProof.fieldDigest) {
    throw new Error("tip fieldDigest drift");
  }
  const d1 = expected.find((w) => w.distance === 1);
  const d2 = expected.find((w) => w.distance === 2);
  if (!d1 || d1.opacity !== "translucent" || !d1.color.startsWith("#")) {
    throw new Error("distance-1 must be translucent with color");
  }
  if (!d2 || d2.opacity !== "opaque" || d2.color !== "") {
    throw new Error("distance-2 must be opaque with empty color");
  }
  console.log("▸ correct sphere on tip ✓", expected.length, "peers");

  const peer = stateFromPixels(chain.pixels.slice(0, tip.index), chain.sequencers, chain.networkId);
  const accepted = await acceptBlock(peer, tip);
  if (!(await verifyChain(accepted))) throw new Error("peer accept correct sphere failed");
  console.log("▸ acceptPixel correct sphere passes ✓");

  // Wrong neighbor effects: resign with forged fieldDigest (wrong peer colors)
  const forgedColors = priorFieldColors(chain.pixels.slice(0, tip.index)).map(() => "#deadbe");
  const forgedWitnesses = buildFieldWitnesses(tip.index, forgedColors);
  const forgedDigest = computeFieldDigest(forgedWitnesses);
  if (forgedDigest === tip.lightProof.fieldDigest) {
    throw new Error("forged digest accidentally matched");
  }

  const forgedProof = await createLightProof({
    sequence: tip.sequence,
    prevHash: tip.prevHash,
    sequencer: alice,
    skipCount: tip.lightProof.skipCount ?? 0,
    electable: tip.lightProof.electable,
    fieldDigest: forgedDigest,
  });
  const forgedTip: LedgerPixel = {
    ...tip,
    lightProof: forgedProof,
    field: forgedWitnesses,
  };

  let rejected = false;
  try {
    await acceptBlock(peer, forgedTip);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("fieldDigest mismatch") && !msg.includes("Invalid PoLS")) {
      throw new Error(`unexpected reject reason: ${msg}`);
    }
    rejected = true;
    console.log("▸ tip with wrong neighbor effects fails ✓", msg.slice(0, 72));
  }
  if (!rejected) throw new Error("forged fieldDigest was accepted — sphere lock broken");

  let assertRejected = false;
  try {
    assertFieldWitnessesMatch(
      forgedDigest,
      tip.index,
      priorFieldColors(chain.pixels.slice(0, tip.index)),
    );
  } catch {
    assertRejected = true;
  }
  if (!assertRejected) throw new Error("assertFieldWitnessesMatch failed to reject forge");
  console.log("▸ acceptPixel recompute rejects mismatch ✓");

  console.log("\n═══ PASS — FieldWitness sphere combination lock ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Lattice S1 — coords, Chebyshev-3, weighted blend, lead-wave preview.
 * bun run test:lattice
 */
import {
  chebyshev3,
  computeFieldDigest,
  createGenesis,
  generateLightKeypair,
  indexToLattice,
  latticePeersInSphere,
  latticeThesis,
  leadWaveAmplitudes,
  neighborBlendHex,
  proposeTransfer,
  sequenceBlock,
  verifyChain,
  buildFieldWitnesses,
  priorFieldColors,
  FIELD_MAX_DISTANCE,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ SPATIAL LATTICE (S1) ═══\n");

  if (!latticeThesis().includes("Chebyshev-3")) throw new Error("thesis");
  if (!/not a rename/i.test(latticeThesis())) throw new Error("thesis invent");
  console.log("▸ thesis ✓");

  const c0 = indexToLattice(0);
  if (c0.x !== 0 || c0.y !== 0 || c0.z !== 0) throw new Error("origin");
  const c1 = indexToLattice(1);
  if (chebyshev3(c0, c1) !== 1) throw new Error("0↔1 should be neighbors");
  console.log("▸ packing + Chebyshev-3 ✓", format(c0), "→", format(c1));

  // Blend: translucent 0.5 + lit 1
  const blend = neighborBlendHex([
    { weight: 1, color: "#ff0000" },
    { weight: 0.5, color: "#0000ff" },
  ]);
  // (255*1 + 0*0.5)/1.5 = 170; blue (0*1+255*0.5)/1.5 = 85
  if (blend !== "#aa0055") throw new Error(`blend ${blend}`);
  if (neighborBlendHex([{ weight: 0, color: "#ffffff" }]) !== "") {
    throw new Error("opaque must not blend");
  }
  console.log("▸ opacity-weighted blend ✓", blend);

  const peers = latticePeersInSphere(3, ["#112233", "#445566", "#778899"], FIELD_MAX_DISTANCE);
  if (peers.length < 1) throw new Error("tip 3 should see lattice peers");
  const tipCoord = indexToLattice(3);
  for (const p of peers) {
    if (chebyshev3(tipCoord, p.coord) > FIELD_MAX_DISTANCE) {
      throw new Error("peer outside sphere");
    }
  }
  console.log("▸ lattice sphere peers at tip 3 ✓", peers.length);

  const wave = leadWaveAmplitudes(0, [0, 1, 2, 3, 4], 10, 2);
  if (!wave.has(0) || (wave.get(0) ?? 0) < (wave.get(1) ?? 0)) {
    throw new Error("lead amplitude should dominate neighbor");
  }
  console.log("▸ lead-wave preview decay ✓");

  // Tip path: fieldDigest includes blend; wrong blend fails recompute
  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  let chain = await createGenesis(alice);
  for (let i = 0; i < 4; i++) {
    const { state: pending } = await proposeTransfer(
      chain,
      alice,
      [{ amount: 1, address: bob.address }],
      { description: `lattice grow ${i}`, recipientLabel: "@bob" },
    );
    chain = await sequenceBlock(pending, alice);
  }
  if (!(await verifyChain(chain))) throw new Error("verify");
  const tip = chain.pixels[chain.pixels.length - 1]!;
  const witnesses = buildFieldWitnesses(tip.index, priorFieldColors(chain.pixels.slice(0, -1)));
  if (computeFieldDigest(witnesses) !== tip.lightProof.fieldDigest) {
    throw new Error("fieldDigest drift after lattice S1");
  }
  if (witnesses.some((w) => typeof w.x !== "number" || typeof w.weight !== "number")) {
    throw new Error("witnesses must carry coords + weight");
  }
  const blendInTip = neighborBlendHex(witnesses);
  console.log(
    "▸ tip fieldDigest binds lattice blend ✓",
    "peers",
    witnesses.length,
    "blend",
    blendInTip || "(none)",
  );

  console.log("\n═══ PASS — spatial lattice S1 ═══");
}

function format(c: { x: number; y: number; z: number }) {
  return `(${c.x},${c.y},${c.z})`;
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

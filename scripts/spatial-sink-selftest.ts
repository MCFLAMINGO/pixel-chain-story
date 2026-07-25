/**
 * Spatial sink adapter (SPATIAL S5) — UI scene mapping, not WebGL.
 * bun run test:spatial-sink
 */
import {
  buildSpatialPicture,
  buildSpatialSinkFromPicture,
  buildSpatialSinkScene,
  createGenesis,
  generateLightKeypair,
  proposeTransfer,
  sequenceBlock,
  spatialSinkThesis,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ SPATIAL SINK (S5) ═══\n");

  if (!spatialSinkThesis().includes("UI sink")) throw new Error("thesis");
  if (!/never consensus/i.test(spatialSinkThesis())) throw new Error("thesis invent");
  console.log("▸ thesis ✓");

  const empty = buildSpatialSinkScene({
    snapshot: { spatialRoot: "aa".repeat(64), cells: [] },
    wave: null,
  });
  if (!empty.uiSinkOnly) throw new Error("uiSinkOnly");
  if (empty.cells.length !== 0) throw new Error("empty cells");
  console.log("▸ empty scene ✓");

  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  let chain = await createGenesis(alice);
  for (let i = 0; i < 3; i++) {
    const { state: pending } = await proposeTransfer(
      chain,
      alice,
      [{ amount: 1, address: bob.address }],
      { description: `sink ${i}`, recipientLabel: "@bob" },
    );
    chain = await sequenceBlock(pending, alice);
  }
  const tip = chain.pixels[chain.pixels.length - 1]!;
  const picture = await buildSpatialPicture(chain.pixels);
  const scene = await buildSpatialSinkFromPicture(picture, {
    tipIndex: tip.index,
    tipHash: tip.hash,
    waveDigest: tip.lightProof.waveDigest,
    hits: tip.wave,
  });

  if (scene.spatialRoot !== tip.lightProof.spatialRoot) throw new Error("spatialRoot");
  if (scene.waveDigest !== tip.lightProof.waveDigest) throw new Error("waveDigest");
  if (scene.cells.length !== chain.pixels.length) throw new Error("cell count");
  if (!scene.cells[0]!.color.startsWith("#")) throw new Error("color hex");
  if (scene.waveHits.length !== (tip.wave?.length ?? 0)) throw new Error("wave hits");
  if (!scene.uiSinkOnly) throw new Error("must flag ui sink");
  console.log(
    "▸ tip scene ✓ cells",
    scene.cells.length,
    "hits",
    scene.waveHits.length,
    "root",
    scene.spatialRoot.slice(0, 12) + "…",
  );

  // Adapter must not invent digests — passthrough only
  const forged = buildSpatialSinkScene({
    snapshot: { spatialRoot: "ff".repeat(64), cells: scene.cells },
    wave: { waveDigest: "ee".repeat(64), hits: [] },
  });
  if (forged.spatialRoot === scene.spatialRoot) throw new Error("passthrough");
  console.log("▸ adapter passthrough (no digest invent) ✓");

  console.log("\n═══ PASS — spatial sink S5 adapter ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

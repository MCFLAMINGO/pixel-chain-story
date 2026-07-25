/**
 * Spatial picture (SPATIAL S3) — sparse occupancy Merkle + tip-bound spatialRoot.
 * Prove illuminated cell; forged spatialRoot rejected.
 * bun run test:spatial-proof
 */
import {
  acceptBlock,
  assertSpatialRootMatch,
  buildHeadersSync,
  buildSpatialPicture,
  createGenesis,
  createLightProof,
  emptySpatialRoot,
  generateLightKeypair,
  lightIlluminatedCellCheck,
  pictureSnapshot,
  proveIlluminatedCell,
  proposeTransfer,
  sequenceBlock,
  spatialPictureThesis,
  stateFromPixels,
  verifyChain,
  verifyIlluminatedCellProof,
  type LedgerPixel,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ SPATIAL PICTURE (S3) ═══\n");

  if (!spatialPictureThesis().includes("spatialRoot")) throw new Error("thesis");
  if (!/not a matplotlib/i.test(spatialPictureThesis())) throw new Error("thesis invent");
  console.log("▸ thesis ✓");

  const empty = await emptySpatialRoot();
  if (empty.length < 64) throw new Error("empty root");
  const vacant = await buildSpatialPicture([]);
  if (vacant.spatialRoot !== empty) throw new Error("vacant picture should be empty root");
  console.log("▸ empty picture root ✓");

  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  let chain = await createGenesis(alice);
  const gRoot = chain.pixels[0]!.lightProof.spatialRoot;
  if (!gRoot) throw new Error("genesis spatialRoot");
  const gPic = await buildSpatialPicture(chain.pixels);
  assertSpatialRootMatch(gRoot, gPic.spatialRoot, 0);
  console.log("▸ genesis spatialRoot ✓ cells", gPic.cells.length);

  for (let i = 0; i < 4; i++) {
    const { state: pending } = await proposeTransfer(
      chain,
      alice,
      [{ amount: 1, address: bob.address }],
      { description: `picture grow ${i}`, recipientLabel: "@bob" },
    );
    chain = await sequenceBlock(pending, alice);
  }
  if (!(await verifyChain(chain))) throw new Error("verify");
  const tip = chain.pixels[chain.pixels.length - 1]!;
  const picture = await buildSpatialPicture(chain.pixels);
  if (picture.spatialRoot !== tip.lightProof.spatialRoot) {
    throw new Error("spatialRoot drift");
  }
  if (picture.cells.length !== chain.pixels.length) {
    throw new Error("every illuminated tip should occupy a cell");
  }
  const snap = pictureSnapshot(picture);
  if (snap.spatialRoot !== picture.spatialRoot || snap.cells.length !== picture.cells.length) {
    throw new Error("snapshot drift");
  }
  console.log("▸ tip spatialRoot matches recompute ✓ cells", snap.cells.length);

  // Prove tip cell lit
  const cellProof = await proveIlluminatedCell(chain.pixels, tip.index);
  if (!cellProof) throw new Error("missing tip cell proof");
  if (!(await verifyIlluminatedCellProof(cellProof))) throw new Error("cell proof verify");
  if (cellProof.spatialRoot !== tip.lightProof.spatialRoot) {
    throw new Error("cell proof root mismatch");
  }
  console.log("▸ illuminated cell proof ✓ index", tip.index, formatCoord(cellProof.coord));

  const headers = await buildHeadersSync(chain);
  if (headers.spatialRoot !== tip.lightProof.spatialRoot) {
    throw new Error("headers sync spatialRoot drift");
  }
  const litCheck = await lightIlluminatedCellCheck(headers, cellProof);
  if (!litCheck.ok) throw new Error(`light cell check: ${litCheck.reason}`);
  console.log("▸ light-client cell check ✓");

  const peer = stateFromPixels(chain.pixels.slice(0, tip.index), chain.sequencers, chain.networkId);
  const accepted = await acceptBlock(peer, tip);
  if (!(await verifyChain(accepted))) throw new Error("accept failed");
  console.log("▸ acceptPixel correct picture passes ✓");

  // Tamper spatialRoot (wrong occupancy commitment)
  const forgedRoot = await emptySpatialRoot();
  if (forgedRoot === tip.lightProof.spatialRoot) throw new Error("forge collided");
  const forgedProof = await createLightProof({
    sequence: tip.sequence,
    prevHash: tip.prevHash,
    sequencer: alice,
    skipCount: tip.lightProof.skipCount ?? 0,
    electable: tip.lightProof.electable,
    fieldDigest: tip.lightProof.fieldDigest,
    waveDigest: tip.lightProof.waveDigest,
    spatialRoot: forgedRoot,
  });
  const forgedTip: LedgerPixel = { ...tip, lightProof: forgedProof };

  let rejected = false;
  try {
    await acceptBlock(peer, forgedTip);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("spatialRoot mismatch") && !msg.includes("Invalid PoLS")) {
      throw new Error(`unexpected: ${msg}`);
    }
    rejected = true;
    console.log("▸ tampered spatialRoot rejected ✓", msg.slice(0, 64));
  }
  if (!rejected) throw new Error("forged spatialRoot accepted");

  // Unlit index has no proof
  const absent = await proveIlluminatedCell(chain.pixels, 9999);
  if (absent !== null) throw new Error("absent cell should not prove");
  console.log("▸ absent cell no proof ✓");

  console.log("\n═══ PASS — spatial picture S3 ═══");
}

function formatCoord(c: { x: number; y: number; z: number }): string {
  return `(${c.x},${c.y},${c.z})`;
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

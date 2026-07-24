/**
 * Tip-mark discipline + canvas identity.
 * Two geneses ≠ same picture; Continuity map+booth share one canvas; Kindling returns tip mark.
 * bun run test:tip-mark
 */
import {
  assertSameCanvas,
  canvasIdEqual,
  canvasIdOf,
  canvasIdThesis,
  createGenesis,
  digestArtifactText,
  formatCanvasId,
  generateLightKeypair,
  goLiveWithSession,
  settleKindling,
  tipMarkThesis,
  assignRungs,
  attachStoreDigest,
  createStoreOffer,
  emptyOpsState,
  markInviteSent,
  merchantJoin,
  confluentSeal,
  kindleOffer,
  kindleAccept,
  forgePersonalSource,
  unlockPersonalSource,
} from "../src/lib/pixel";
import { settleBoothCheckoutOnPixel } from "../src/lib/pixel/continuity-settlement";

async function main() {
  console.log("═══ TIP MARK + CANVAS ID ═══\n");

  if (!canvasIdThesis().includes("genesisHash")) throw new Error("canvas thesis");
  if (!tipMarkThesis().includes("shared public tip")) throw new Error("tip mark thesis");
  console.log("▸ thesis ✓");

  const a = await generateLightKeypair();
  const b = await generateLightKeypair();
  const g1 = await createGenesis(a);
  const g2 = await createGenesis(b);
  const c1 = canvasIdOf(g1);
  const c2 = canvasIdOf(g2);
  if (c1.networkId !== c2.networkId) throw new Error("family networkId should match");
  if (canvasIdEqual(c1, c2)) throw new Error("two geneses must be different canvases");
  let threw = false;
  try {
    assertSameCanvas(c1, c2);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("assertSameCanvas must reject foreign tip");
  console.log("▸ two geneses → different canvas ✓", formatCanvasId(c1), "≠", formatCanvasId(c2));

  // Continuity: go live binds booth to map tip
  let ops = emptyOpsState("Canvas Operator");
  ops = createStoreOffer(ops, {
    name: "Tip Mark Cafe",
    domain: "tipmark.example",
    originUrl: "https://tipmark.example/",
  });
  const storeId = ops.stores[0]!.id;
  ops = markInviteSent(ops, storeId);
  ops = merchantJoin(ops, ops.stores[0]!.inviteToken, {});
  ops = attachStoreDigest(ops, storeId, await digestArtifactText("<html>tip mark</html>"));
  ops = assignRungs(ops, storeId, [ops.rungs[0]!.id]);
  const bound = await goLiveWithSession(ops, storeId);
  ops = bound.ops;
  const store = ops.stores[0]!;
  if (bound.tipMark.kind !== "continuity-digest") throw new Error("digest tip mark");
  if (bound.tipMark.attachment !== "lab_local") throw new Error("digest still lab_local");
  if (store.genesisHash !== canvasIdOf(bound.session.chain).genesisHash) {
    throw new Error("store genesis must match session");
  }
  console.log("▸ Continuity go-live binds booth canvas ✓ tip #", store.pixelIndex);

  const foreign = await createContinuityForeign();
  threw = false;
  try {
    await settleBoothCheckoutOnPixel({
      ops,
      session: { ...foreign, storeId, domain: store.domain },
      amountPix: 10,
    });
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("foreign booth canvas must fail");
  console.log("▸ foreign booth canvas rejected ✓");

  const sale = await settleBoothCheckoutOnPixel({
    ops,
    session: bound.session,
    amountPix: 25,
    orderRef: "TIP-1",
  });
  if (sale.tipMark.kind !== "booth-sale") throw new Error("sale mark");
  if (sale.tipMark.canvasId.genesisHash !== store.genesisHash) throw new Error("sale canvas");
  if (sale.tipIndex <= (store.pixelIndex ?? 0)) throw new Error("tip must advance past map tip");
  console.log("▸ booth sale tip mark on same canvas ✓ tip #", sale.tipIndex);

  // Kindling tip mark
  const dale = await forgePersonalSource("dale");
  const joe = await forgePersonalSource("joe");
  const unlocked = await unlockPersonalSource(dale.source);
  const intent = { fromLocal: "dale", toLocal: "joe", amount: 1, note: "tip mark" };
  const offer = await kindleOffer(intent);
  const accept = await kindleAccept(intent);
  const { captureFromRaster, patternToRaster } = await import("../src/lib/pixel");
  const sealR = await confluentSeal(offer, accept, {
    offerCapture: captureFromRaster(patternToRaster(offer.pattern, 14)),
    acceptCapture: captureFromRaster(patternToRaster(accept.pattern, 14)),
  });
  if (!sealR.ok) throw new Error(`seal ${sealR.reason}`);
  const genesis = await createGenesis(unlocked.keypair);
  const kindled = await settleKindling({
    state: genesis,
    from: unlocked.keypair,
    ownerAddress: dale.source.address,
    sequencer: unlocked.keypair,
    toAddress: joe.source.address,
    seal: sealR.seal,
    gatewayHeldSeed: false,
    attachment: "lab_local",
  });
  if (kindled.tipMark.kind !== "kindling") throw new Error("kindling mark");
  if (kindled.tipMark.attachment !== "lab_local") throw new Error("kindling plane");
  console.log("▸ Kindling tip mark ✓", kindled.tipMark.tipIndex);

  console.log("\n═══ TIP MARK + CANVAS ID PASS ═══");
}

async function createContinuityForeign() {
  const { createContinuitySession } = await import("../src/lib/pixel/continuity-settlement");
  return createContinuitySession({
    storeId: "foreign",
    domain: "other.example",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

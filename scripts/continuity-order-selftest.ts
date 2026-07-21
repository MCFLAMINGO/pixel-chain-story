/**
 * Continuity order + booth settlement selftest — real PIX UTXOs + till when origin dark.
 * bun run test:continuity-order
 */
import {
  assignRungs,
  attachStoreDigest,
  createStoreOffer,
  digestArtifactText,
  emptyOpsState,
  goLive,
  markInviteSent,
  markStoreOriginDark,
  merchantJoin,
  tillAccruedPix,
  tillIsActive,
} from "../src/lib/pixel/continuity-ops";
import {
  createContinuitySession,
  handleContinuityOrder,
  settleBoothCheckoutOnPixel,
} from "../src/lib/pixel/continuity-settlement";
import { balanceOf, verifyChain as verifyPixelChain } from "../src/lib/pixel/chain";

async function main() {
  console.log("═══ CONTINUITY ORDER / BOOTH SETTLEMENT ═══\n");

  let ops = emptyOpsState("Order Operator");
  ops = createStoreOffer(ops, {
    name: "McFlamingo",
    domain: "www.mcflamingo.com",
    originUrl: "https://www.mcflamingo.com/",
    priceUsdPerMonth: 20,
  });
  const storeId = ops.stores[0]!.id;
  const token = ops.stores[0]!.inviteToken;
  ops = markInviteSent(ops, storeId);
  ops = merchantJoin(ops, token, {});
  ops = attachStoreDigest(
    ops,
    storeId,
    await digestArtifactText("<html>mcflamingo homepage capture</html>"),
  );
  ops = assignRungs(ops, storeId, [ops.rungs[0]!.id, ops.rungs[1]!.id]);
  ops = await goLive(ops, storeId);

  const live = ops.stores[0]!;
  if (!live.anchoredOnPixel) throw new Error("must be anchored");
  console.log("▸ live + anchored tip #", live.pixelIndex);

  let session = await createContinuitySession({
    storeId,
    domain: live.domain,
  });
  ops = {
    ...ops,
    stores: ops.stores.map((s) =>
      s.id === storeId
        ? {
            ...s,
            merchantAddress: session.merchant.address,
            tillAddress: session.till.address,
            updatedAt: Date.now(),
          }
        : s,
    ),
  };

  // Healthy origin — till idle → sale settles, no till fee
  let settled = await settleBoothCheckoutOnPixel({
    ops,
    session,
    amountPix: 100,
    orderRef: "MCF-healthy",
  });
  ops = settled.ops;
  session = settled.session;
  if (settled.feePix !== 0) throw new Error("till must be idle while healthy");
  if (settled.tillTxid) throw new Error("no till tx while healthy");
  if (!(await verifyPixelChain(session.chain))) throw new Error("chain invalid after sale");
  console.log("▸ healthy booth sale 100 PIX · tip #", settled.tipIndex, "· no till ✓");

  // Origin dark → till active → on-chain fee
  ops = markStoreOriginDark(ops, storeId);
  if (!tillIsActive(ops.stores[0]!)) throw new Error("till should activate");

  const ordered = await handleContinuityOrder({
    ops,
    session,
    req: {
      storeDomain: "mcflamingo.com",
      amountPix: 200,
      orderRef: "MCF-webhook-1",
      via: "webhook",
    },
  });
  ops = ordered.ops;
  session = ordered.session;
  const r = ordered.result;
  if (!r.ok) throw new Error("order not ok");
  if (r.feePix !== 2) throw new Error(`fee want 2 got ${r.feePix}`);
  if (!r.tillTxid) throw new Error("till txid required when origin dark");
  if (!r.originDark) throw new Error("originDark");
  if (r.tillBalance !== 2) throw new Error(`till bal want 2 got ${r.tillBalance}`);
  if (tillAccruedPix(ops.stores[0]!) !== 2) throw new Error("ops till accrued");
  const ev = ops.stores[0]!.tillEvents!.find((e) => e.txid === r.tillTxid);
  if (!ev?.onChain) throw new Error("till event must be onChain");
  if (!(await verifyPixelChain(session.chain))) throw new Error("chain invalid after till");
  console.log("▸ webhook order 200 PIX · till fee", r.feePix, "on-chain · tip #", r.tipIndex);

  // Second booth pay while dark
  settled = await settleBoothCheckoutOnPixel({
    ops,
    session,
    amountPix: 100,
  });
  if (settled.feePix !== 1) throw new Error("second fee");
  if (balanceOf(settled.session.chain, settled.session.till.address) !== 3) {
    throw new Error("till balance 3");
  }
  if (tillAccruedPix(settled.ops.stores[0]!) !== 3) throw new Error("accrued 3");
  console.log("▸ second booth till fee 1 · till bal 3 ✓");

  console.log("\nHonesty: booth settles PIX; Popmenu still serves live menu; no DNS claim.");
  console.log("═══ PASS — Continuity order / booth settlement ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

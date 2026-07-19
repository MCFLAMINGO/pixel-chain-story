/**
 * Continuity ops — merchant handshake + map/till economics.
 * bun run test:continuity-ops
 */
import {
  activeTillBps,
  assignRungs,
  attachStoreDigest,
  createStoreOffer,
  digestArtifactText,
  emptyOpsState,
  goLive,
  markInviteSent,
  markStoreOriginDark,
  merchantJoin,
  merchantOfferCopy,
  stepIndex,
  storeByInvite,
  tillFeePix,
  tillIsActive,
} from "../src/lib/pixel/continuity-ops";

async function main() {
  console.log("═══ CONTINUITY OPS WIZARD ═══\n");

  let state = emptyOpsState("Lab Operator");
  if (state.rungs.length !== 5) throw new Error("expected 5 default rungs");
  console.log("▸ 5 default rungs ✓");

  state = createStoreOffer(state, {
    name: "Demo Grill",
    domain: "demo.grill.test",
    originUrl: "https://demo.grill.test",
    priceUsdPerMonth: 20,
  });
  const store = state.stores[0];
  if (store.step !== "draft") throw new Error("draft");
  if (store.tillCutBpsWhenOriginDark !== 100) throw new Error("default till bps");
  if (!merchantOfferCopy(store).includes("$20/mo")) throw new Error("offer copy");
  console.log("▸ step1 create offer + map/till defaults ✓", store.inviteToken.slice(0, 8) + "…");

  state = markInviteSent(state, store.id);
  if (storeByInvite(state, store.inviteToken)?.step !== "invite_sent") {
    throw new Error("invite_sent");
  }
  console.log("▸ step2 invite sent ✓");

  // Merchant handshake — no digest required
  state = merchantJoin(state, store.inviteToken, {});
  if (state.stores[0].step !== "merchant_joined") throw new Error("merchant join");
  if (state.stores[0].digest) throw new Error("digest should be absent until operator attaches");
  console.log("▸ step3 merchant join without digest (handshake) ✓");

  const digest = await digestArtifactText("<html>McFlamingo demo storefront</html>");
  state = attachStoreDigest(state, store.id, digest);
  if (state.stores[0].digest !== digest) throw new Error("attach digest");
  console.log("▸ operator attach digest ✓");

  state = assignRungs(state, store.id, [state.rungs[0].id, state.rungs[1].id]);
  if (state.stores[0].step !== "rungs_assigned") throw new Error("rungs");
  console.log("▸ step4 rungs assigned ✓");

  state = await goLive(state, store.id, { pixelIndex: 3 });
  let live = state.stores[0];
  if (live.step !== "live" || stepIndex("live") !== 4) throw new Error("live");
  if (live.continuity?.state !== "in_the_light") throw new Error("siso not in light");
  if (!live.deployPlan?.length) throw new Error("missing booth jobs");
  if (live.deployPlan.some((i) => /dns/i.test(i.title) && !/failover/i.test(i.title))) {
    /* titles use failover now */
  }
  if (tillIsActive(live)) throw new Error("till should be idle while origin up");
  if (tillFeePix(live, 1000) !== 0) throw new Error("no till fee while healthy");
  console.log("▸ step5 live + SISO + operator booth jobs ✓", live.deployPlan.length, "items");

  state = markStoreOriginDark(state, store.id);
  live = state.stores[0];
  if (live.continuity?.state !== "origin_dark") throw new Error("origin_dark");
  if (!tillIsActive(live)) throw new Error("till should activate");
  if (activeTillBps(live) !== 100) throw new Error("till bps");
  if (tillFeePix(live, 10_000) !== 100) throw new Error("1% of 10000 = 100");
  console.log("▸ origin dark → till 100 bps on PIX volume ✓");

  console.log("\n═══ PASS — continuity handshake + map/till ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

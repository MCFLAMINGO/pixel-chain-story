/**
 * Continuity ops wizard — offer → invite → join → rungs → live.
 * bun run test:continuity-ops
 */
import {
  assignRungs,
  createStoreOffer,
  digestArtifactText,
  emptyOpsState,
  goLive,
  markInviteSent,
  merchantJoin,
  stepIndex,
  storeByInvite,
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
  console.log("▸ step1 create offer ✓", store.inviteToken.slice(0, 8) + "…");

  state = markInviteSent(state, store.id);
  if (storeByInvite(state, store.inviteToken)?.step !== "invite_sent") {
    throw new Error("invite_sent");
  }
  console.log("▸ step2 invite sent ✓");

  const digest = await digestArtifactText("<html>McFlamingo demo storefront</html>");
  state = merchantJoin(state, store.inviteToken, {
    originUrl: "https://demo.grill.test",
    digest,
  });
  if (state.stores[0].step !== "merchant_joined" || state.stores[0].digest !== digest) {
    throw new Error("merchant join");
  }
  console.log("▸ step3 merchant joined + digest ✓");

  state = assignRungs(state, store.id, [state.rungs[0].id, state.rungs[1].id]);
  if (state.stores[0].step !== "rungs_assigned") throw new Error("rungs");
  console.log("▸ step4 rungs assigned ✓");

  state = await goLive(state, store.id, { pixelIndex: 3 });
  const live = state.stores[0];
  if (live.step !== "live" || stepIndex("live") !== 4) throw new Error("live");
  if (live.continuity?.state !== "in_the_light") throw new Error("siso not in light");
  if (!live.deployPlan?.length) throw new Error("missing deploy plan");
  console.log("▸ step5 live + SISO + deploy checklist ✓", live.deployPlan.length, "items");

  console.log("\n═══ PASS — continuity ops pipeline ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

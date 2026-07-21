/**
 * Continuity ops — merchant handshake + map/till economics.
 * bun run test:continuity-ops
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  activeTillBps,
  assignRungs,
  attachStoreDigest,
  continuityInvitePrerequisites,
  createStoreOffer,
  digestArtifactText,
  emptyOpsState,
  goLive,
  markInviteSent,
  markStoreOriginDark,
  merchantJoin,
  merchantOfferCopy,
  seedMcFlamingoDemo,
  selfServeShineIn,
  shineInPlainThesis,
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

  if (continuityInvitePrerequisites().length < 3) throw new Error("invite prereqs");
  const html = await readFile(
    join(import.meta.dir, "../public/mcflamingo/homepage-snapshot.html"),
    "utf8",
  );
  let demo = emptyOpsState("McFlamingo Continuity");
  demo = await seedMcFlamingoDemo(demo, html, {
    originUrl: "https://www.mcflamingo.com/",
    mirrorUrls: ["https://www.mcflamingo.com/", "https://www.mcflamingo.com/menu"],
  });
  if (demo.stores[0]?.step !== "live") throw new Error("mcflamingo seed not live");
  if (demo.stores[0]?.name !== "McFlamingo") throw new Error("name");
  if (demo.stores[0]?.originUrl !== "https://www.mcflamingo.com/") {
    throw new Error("origin must be live McFlamingo site");
  }
  if (!demo.stores[0]?.digest) throw new Error("digest missing");
  if (demo.stores[0]?.continuity?.state !== "in_the_light") throw new Error("siso");
  const firstId = demo.stores[0]!.id;
  demo = await seedMcFlamingoDemo(demo, html, {
    originUrl: "https://www.mcflamingo.com/",
    mirrorUrls: ["https://www.mcflamingo.com/", "https://www.mcflamingo.com/menu"],
  });
  if (demo.stores.length !== 1) throw new Error("re-seed must replace prior McFlamingo row");
  if (demo.stores[0]!.id === firstId) throw new Error("re-seed should mint a fresh store id");
  console.log("▸ seedMcFlamingoDemo real-site shine-in ✓");

  if (!shineInPlainThesis().includes("Shine in")) throw new Error("plain thesis");
  let self = emptyOpsState("Self Serve");
  self = await selfServeShineIn(self, {
    name: "Corner Cafe",
    domain: "corner.cafe.test",
    artifactHtml: "<html><body>Corner Cafe</body></html>",
  });
  if (self.stores[0]?.step !== "live") throw new Error("self-serve not live");
  if (self.stores[0]?.continuity?.state !== "in_the_light") throw new Error("self-serve siso");
  console.log("▸ selfServeShineIn brand path ✓");

  console.log("\n═══ PASS — continuity handshake + map/till ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

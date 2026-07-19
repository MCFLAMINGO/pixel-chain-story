/**
 * Lab Continuity chaos drill — origin dark → mirrors serve → till accrues.
 * bun run test:chaos-drill
 *
 * Not Gate J public-regime evidence.
 */
import { canServeWithoutOrigin } from "../src/lib/pixel/siso";
import {
  assignRungs,
  attachStoreDigest,
  createStoreOffer,
  digestArtifactText,
  emptyOpsState,
  goLive,
  markInviteSent,
  merchantJoin,
  recordTillSettlement,
  runChaosDrill,
  tillAccruedPix,
  tillFeePix,
  tillIsActive,
} from "../src/lib/pixel/continuity-ops";

async function main() {
  console.log("═══ CONTINUITY CHAOS DRILL (LAB) ═══\n");

  let state = emptyOpsState("Drill Operator");
  state = createStoreOffer(state, {
    name: "Corner Cafe",
    domain: "corner.cafe.test",
    originUrl: "https://corner.cafe.test",
    priceUsdPerMonth: 25,
  });
  const storeId = state.stores[0].id;
  const token = state.stores[0].inviteToken;
  state = markInviteSent(state, storeId);
  state = merchantJoin(state, token, {});
  state = attachStoreDigest(
    state,
    storeId,
    await digestArtifactText("<html>corner cafe storefront</html>"),
  );
  state = assignRungs(state, storeId, [state.rungs[0].id, state.rungs[1].id]);
  state = await goLive(state, storeId, { pixelIndex: 7 });

  const live = state.stores[0];
  if (live.step !== "live") throw new Error("not live");
  if (!canServeWithoutOrigin(live.continuity!)) throw new Error("should serve while in light");
  if (tillIsActive(live)) throw new Error("till must be idle while origin up");
  let rejected = false;
  try {
    recordTillSettlement(state, storeId, 1000);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("till record must fail while idle");
  console.log("▸ live + mirrors; till idle while healthy ✓");

  const { state: drilled, report } = await runChaosDrill(state, storeId, {
    settlementPix: 10_000,
  });
  const after = drilled.stores[0];
  if (!report.originDark) throw new Error("report.originDark");
  if (!report.mirrorsServe) throw new Error("report.mirrorsServe");
  if (!report.tillActive) throw new Error("report.tillActive");
  if (report.feePix !== 100) throw new Error(`fee want 100 got ${report.feePix}`);
  if (report.accruedPix !== 100) throw new Error(`accrued want 100 got ${report.accruedPix}`);
  if (after.continuity?.state !== "origin_dark") throw new Error("state not origin_dark");
  if (!canServeWithoutOrigin(after.continuity)) throw new Error("must serve without origin");
  if (tillAccruedPix(after) !== 100) throw new Error("ledger accrued");
  if ((after.tillEvents ?? []).length !== 1) throw new Error("one till event");
  if (after.tillEvents![0].via !== "mirror") throw new Error("via mirror");
  console.log("▸ drill:", report.claim);
  console.log(
    "▸ fee",
    report.feePix,
    "on",
    report.settlementPix,
    "PIX · accrued",
    report.accruedPix,
  );

  // Second simulated checkout
  const again = recordTillSettlement(drilled, storeId, 5_000, { via: "simulated" });
  const fee2 = tillFeePix(again.stores[0], 5_000);
  if (fee2 !== 50) throw new Error("second fee");
  if (tillAccruedPix(again.stores[0]) !== 150) throw new Error("accrued 150");
  console.log("▸ second till event accrues ✓ total", tillAccruedPix(again.stores[0]));

  console.log("\n═══ PASS — lab chaos drill (not Gate J) ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

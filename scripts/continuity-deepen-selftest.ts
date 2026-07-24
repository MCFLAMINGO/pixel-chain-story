/**
 * Continuity invite pack + webhook selftest.
 * bun run test:continuity-deepen
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assignRungs,
  attachStoreDigest,
  createStoreOffer,
  digestArtifactText,
  emptyOpsState,
  goLiveWithSession,
  markInviteSent,
  markStoreOriginDark,
  merchantJoin,
  storeByInvite,
} from "../src/lib/pixel/continuity-ops";
import {
  buildInvitePack,
  continuityDisciplineLine,
  continuityPitchPair,
  decodeInvitePack,
  encodeInvitePack,
  importInvitePack,
  publicInviteView,
} from "../src/lib/pixel/continuity-invite-pack";
import { handleContinuityHttp } from "../src/node/continuity-http";
import { saveContinuityOps, saveContinuitySession } from "../src/node/continuity-store";

async function main() {
  console.log("═══ CONTINUITY DEEPEN (PACK + WEBHOOK) ═══\n");

  if (!continuityDisciplineLine().includes("Pixel does not host the internet")) {
    throw new Error("discipline line");
  }
  const paired = continuityPitchPair("Your menu can stay reachable.");
  if (!paired.includes("Settlement and the Continuity map")) throw new Error("pitch pair");
  console.log("▸ pitch discipline ✓");

  let ops = emptyOpsState("Pack Operator");
  ops = createStoreOffer(ops, {
    name: "Corner Cafe",
    domain: "corner.cafe.test",
    originUrl: "https://corner.cafe.test",
  });
  const storeId = ops.stores[0]!.id;
  const token = ops.stores[0]!.inviteToken;
  ops = markInviteSent(ops, storeId);
  ops = assignRungs(ops, storeId, [ops.rungs[0]!.id]);

  const pack = buildInvitePack(ops, storeId);
  const encoded = encodeInvitePack(pack);
  const decoded = decodeInvitePack(encoded);
  if (decoded.store.inviteToken !== token) throw new Error("pack token");
  if (!decoded.discipline.includes("Pixel")) throw new Error("pack discipline");

  const phoneB = importInvitePack(emptyOpsState("Phone B"), decoded);
  if (!storeByInvite(phoneB, token)) throw new Error("import missing store");
  const joined = merchantJoin(phoneB, token, {});
  if (joined.stores[0]!.step !== "merchant_joined") throw new Error("join after pack");
  console.log("▸ invite pack cross-phone import + join ✓");

  // Node Continuity webhook
  const dir = await mkdtemp(join(tmpdir(), "pixel-cont-"));
  const secret = "lab-secret-deepen";
  try {
    let nodeOps = emptyOpsState("Node Continuity");
    nodeOps = createStoreOffer(nodeOps, {
      name: "McFlamingo",
      domain: "www.mcflamingo.com",
      originUrl: "https://www.mcflamingo.com/",
    });
    const sid = nodeOps.stores[0]!.id;
    const itok = nodeOps.stores[0]!.inviteToken;
    nodeOps = markInviteSent(nodeOps, sid);
    nodeOps = merchantJoin(nodeOps, itok, {});
    nodeOps = attachStoreDigest(nodeOps, sid, await digestArtifactText("<html>mcflamingo</html>"));
    nodeOps = assignRungs(nodeOps, sid, [nodeOps.rungs[0]!.id, nodeOps.rungs[1]!.id]);
    const liveBound = await goLiveWithSession(nodeOps, sid);
    nodeOps = markStoreOriginDark(liveBound.ops, sid);
    await saveContinuityOps(dir, nodeOps);
    await saveContinuitySession(dir, liveBound.session);

    const ctx = { datadir: dir, webhookSecret: secret };
    const inviteRes = await handleContinuityHttp(
      new Request(`http://127.0.0.1/continuity/invite/${itok}`),
      new URL(`http://127.0.0.1/continuity/invite/${itok}`),
      ctx,
    );
    if (!inviteRes || inviteRes.status !== 200) throw new Error("invite GET");
    const inviteJson = (await inviteRes.json()) as { ok: boolean; invite: { name: string } };
    if (!inviteJson.ok || inviteJson.invite.name !== "McFlamingo") throw new Error("invite body");
    const pub = publicInviteView(nodeOps.stores[0]!);
    if (pub.discipline !== continuityDisciplineLine()) throw new Error("public discipline");
    console.log("▸ GET /continuity/invite/:token ✓");

    const bad = await handleContinuityHttp(
      new Request("http://127.0.0.1/continuity/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeDomain: "www.mcflamingo.com", amountPix: 100 }),
      }),
      new URL("http://127.0.0.1/continuity/order"),
      ctx,
    );
    if (!bad || bad.status !== 401) throw new Error("webhook must require secret");

    const orderRes = await handleContinuityHttp(
      new Request("http://127.0.0.1/continuity/order", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-continuity-secret": secret,
        },
        body: JSON.stringify({
          storeDomain: "mcflamingo.com",
          amountPix: 200,
          via: "popmenu",
          orderRef: "TOAST-1",
        }),
      }),
      new URL("http://127.0.0.1/continuity/order"),
      ctx,
    );
    if (!orderRes || orderRes.status !== 200) {
      throw new Error(`order status ${orderRes?.status}`);
    }
    const orderJson = (await orderRes.json()) as {
      ok: boolean;
      result: { feePix: number; tillTxid?: string; originDark: boolean };
      discipline: string;
    };
    if (!orderJson.ok) throw new Error("order not ok");
    if (orderJson.result.feePix !== 2) throw new Error(`fee ${orderJson.result.feePix}`);
    if (!orderJson.result.tillTxid) throw new Error("till txid");
    if (!orderJson.result.originDark) throw new Error("originDark");
    if (!orderJson.discipline.includes("node_sidecar")) throw new Error("order discipline");
    console.log("▸ POST /continuity/order webhook + on-chain till ✓");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  console.log("\nHonesty: packs + webhook deepen Continuity; Pixel does not host the internet.");
  console.log("═══ PASS — Continuity deepen ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

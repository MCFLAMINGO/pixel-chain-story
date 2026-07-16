/**
 * Signal bridge / uptake — never spend authority.
 * bun scripts/access-selftest.ts
 */

import {
  ACCESS_FORMS,
  ACCESS_PERSONAS,
  Access,
  enqueueOffline,
  flushOfflineQueue,
  handleAccessIntent,
  handleUssdInput,
  helperAssistedSend,
  normalizeLocalId,
  parseAccessText,
  ussdMenuText,
  type UssdSession,
} from "../src/lib/pixel/access";
import { UPTAKE_LADDER, inviteToKindleIntent } from "../src/lib/pixel/uptake";

async function main() {
  console.log("═══ ACCESS — signal bridge (no spend) ═══\n");

  for (const p of ACCESS_PERSONAS) {
    console.log(`· ${p.id.padEnd(22)} ${p.place}`);
  }
  for (const s of UPTAKE_LADDER) {
    console.log(`  tier ${s.tier}: spend=${s.canSpend}`);
  }

  const directory = (id: string) => {
    const key = normalizeLocalId(id);
    const map: Record<string, string> = {
      "+8801711000001": "pix1farmer_bd_aaaaaaaaaaaaaaaa",
      rina: "pix1rina_bbbbbbbbbbbbbbbbbbbbbb",
      "+16205551212": "pix1kansas_cccccccccccccccccc",
      joe: "pix1joe_dddddddddddddddddddddd",
    };
    return map[key] ?? map[id] ?? map[id.toLowerCase()];
  };
  const ctx = {
    directory,
    balanceOf: (a: string) => (a.includes("kansas") ? 100 : a.includes("farmer") ? 40 : 0),
    pendingCount: () => 0,
    expectedPin: "1234",
  };

  const bdPersona = ACCESS_PERSONAS.find((p) => p.id === "bangladesh_peasant")!;
  const bd = parseAccessText(bdPersona.sampleText, "sms", bdPersona.localId, "bn");
  const bdRes = handleAccessIntent(bd, ctx);
  if (bdRes.reply.code !== "KINDLING_REQUIRED") throw new Error("bd must invite kindling");
  if (!inviteToKindleIntent(bdRes) || inviteToKindleIntent(bdRes)!.amount !== 5) {
    throw new Error("bd invite");
  }
  if (bdRes.reply.sms.length > 160) throw new Error("sms too long");
  console.log("\n▸ BD SMS invite:", bdRes.reply.sms);

  const ks = parseAccessText("SEND joe 12", "ussd", "+16205551212", "en");
  const ksRes = handleAccessIntent(ks, ctx);
  if (ksRes.reply.code !== "KINDLING_REQUIRED") throw new Error("ks");
  console.log("▸ KS invite:", ksRes.reply.sms);

  let session: UssdSession = {
    step: "menu",
    locale: "bn",
    fromLocalId: "+8801711000001",
  };
  const balStep = handleUssdInput(session, "1", ctx);
  if (!balStep.result?.reply.sms.includes("40")) throw new Error("ussd bal");
  console.log("▸ BD USSD bal:", balStep.result.reply.sms);

  session = { step: "menu", locale: "en", fromLocalId: "+16205551212" };
  session = handleUssdInput(session, "2", ctx).session;
  session = handleUssdInput(session, "joe", ctx).session;
  const ussdSend = handleUssdInput(session, "7", ctx);
  if (ussdSend.result?.reply.code !== "KINDLING_REQUIRED") throw new Error("ussd invite");
  console.log("▸ KS USSD invite:", ussdSend.result.reply.sms);

  const need = helperAssistedSend("+16205551212", "joe", 3, "en", ctx);
  if (need.reply.code !== "NEED_CONFIRM") throw new Error("helper need confirm");
  const ok = helperAssistedSend("+16205551212", "joe", 3, "en", ctx, "YES");
  if (ok.reply.code !== "KINDLING_REQUIRED") throw new Error("helper still kindling");
  console.log("▸ Helper invite:", ok.reply.sms);

  const intent = parseAccessText("SEND rina 2", "offline_queue", "+8801711000001", "bn");
  const queued = handleAccessIntent(intent, ctx);
  if (queued.reply.code !== "KINDLING_REQUIRED") throw new Error("queue invite");
  const q = enqueueOffline([], intent);
  const flushed = flushOfflineQueue(q, ctx);
  if (flushed.results[0].reply.code !== "KINDLING_REQUIRED") throw new Error("flush");
  console.log("▸ Offline invite:", flushed.results[0].reply.sms);

  const bal = Access.handle(Access.parse("BALANCE", "sms", "+16205551212", "en"), ctx);
  if (!bal.reply.sms.includes("100")) throw new Error("bal");
  console.log("▸ Balance (read OK):", bal.reply.sms);

  if (!ACCESS_FORMS.some((f) => f.id === "kindling")) throw new Error("kindling form");
  if (!ussdMenuText("bn").includes("কিন্ডলিং") && !ussdMenuText("bn").includes("1")) {
    throw new Error("bn menu");
  }

  console.log("\n═══ PASS — signal bridges invite; Kindling spends ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

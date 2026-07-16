/**
 * Peasant / farmer access paths.
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

async function main() {
  console.log("═══ ACCESS — Bangladesh · Kansas ═══\n");

  if (ACCESS_PERSONAS.length < 2) throw new Error("personas");
  for (const p of ACCESS_PERSONAS) {
    console.log(`· ${p.id.padEnd(22)} ${p.place} — ${p.channels.slice(0, 3).join(", ")}`);
  }
  console.log("");
  for (const f of ACCESS_FORMS) {
    console.log(`  ${f.id.padEnd(14)} ${f.who}`);
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
  const balances: Record<string, number> = {
    pix1farmer_bd_aaaaaaaaaaaaaaaa: 40,
    pix1kansas_cccccccccccccccccc: 100,
    pix1rina_bbbbbbbbbbbbbbbbbbbbbb: 0,
    pix1joe_dddddddddddddddddddddd: 0,
  };

  const ctx = {
    directory,
    balanceOf: (a: string) => balances[a] ?? 0,
    pendingCount: () => 0,
    expectedPin: "1234",
  };

  // Bangladesh — Bangla SMS (persona sample)
  const bdPersona = ACCESS_PERSONAS.find((p) => p.id === "bangladesh_peasant")!;
  const bd = parseAccessText(bdPersona.sampleText, "sms", bdPersona.localId, "bn");
  const bdRes = handleAccessIntent(bd, ctx);
  if (!bdRes.ledgerSend || bdRes.ledgerSend.amount !== 5) throw new Error("bd send");
  if (bdRes.reply.sms.length > 160) throw new Error("sms too long");
  console.log("\n▸ BD SMS:", bdRes.reply.sms);

  // Also English SEND with Bangla note
  const bd2 = parseAccessText("SEND rina 5 চাল", "sms", "+8801711000001", "bn");
  if (!handleAccessIntent(bd2, ctx).ledgerSend) throw new Error("bd2");

  // Kansas — English USSD-style free text
  const ksPersona = ACCESS_PERSONAS.find((p) => p.id === "kansas_farmer")!;
  const ks = parseAccessText(ksPersona.sampleText, "ussd", ksPersona.localId, "en");
  const ksRes = handleAccessIntent(ks, ctx);
  if (!ksRes.ledgerSend || ksRes.reply.code !== "OK") throw new Error("ks send");
  console.log("▸ KS send:", ksRes.reply.sms);

  // USSD digit menu — Bangladesh
  let session: UssdSession = {
    step: "menu",
    locale: "bn",
    fromLocalId: "+8801711000001",
  };
  const menu = handleUssdInput(session, "", ctx);
  if (!menu.prompt.includes("1")) throw new Error("ussd menu");
  session = menu.session;
  const balStep = handleUssdInput(session, "1", ctx);
  if (!balStep.result?.reply.sms.includes("40")) throw new Error("ussd bal");
  console.log("▸ BD USSD bal:", balStep.result.reply.sms);

  // USSD send flow — Kansas
  session = { step: "menu", locale: "en", fromLocalId: "+16205551212" };
  session = handleUssdInput(session, "2", ctx).session;
  session = handleUssdInput(session, "joe", ctx).session;
  const ussdSend = handleUssdInput(session, "7", ctx);
  if (!ussdSend.result?.ledgerSend || ussdSend.result.ledgerSend.amount !== 7) {
    throw new Error("ussd send");
  }
  console.log("▸ KS USSD send:", ussdSend.result.reply.sms);

  // Helper desk — needs confirm
  const need = helperAssistedSend("+16205551212", "joe", 3, "en", ctx);
  if (need.reply.code !== "NEED_CONFIRM") throw new Error("helper need confirm");
  const ok = helperAssistedSend("+16205551212", "joe", 3, "en", ctx, "YES");
  if (!ok.ledgerSend) throw new Error("helper yes");
  const pin = helperAssistedSend("+16205551212", "joe", 3, "en", ctx, "1234");
  if (!pin.ledgerSend) throw new Error("helper pin");
  console.log("▸ Helper:", ok.reply.sms);

  // Offline queue → flush
  const intent = parseAccessText("SEND rina 2", "offline_queue", "+8801711000001", "bn");
  const queued = handleAccessIntent(intent, ctx);
  if (queued.reply.code !== "QUEUED") throw new Error("queue");
  let q = enqueueOffline([], intent);
  const flushed = flushOfflineQueue(q, ctx);
  if (flushed.results.length !== 1 || flushed.results[0].reply.code !== "OK") {
    throw new Error("flush");
  }
  if (flushed.results[0].ledgerSend?.offline) throw new Error("flush still offline");
  console.log("▸ Offline→sync:", flushed.results[0].reply.sms);

  // Balance + One.Access surface
  const bal = Access.handle(Access.parse("BALANCE", "sms", "+16205551212", "en"), ctx);
  if (!bal.reply.sms.includes("100")) throw new Error("bal");
  console.log("▸ Balance:", bal.reply.sms);

  if (!ussdMenuText("bn").includes("ব্যালেন্স")) throw new Error("bn menu");
  if (normalizeLocalId("8801711000001") !== "+8801711000001") throw new Error("norm");

  console.log("\n═══ PASS — same ledger, many doors ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

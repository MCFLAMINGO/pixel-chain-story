/**
 * Peasant / farmer access paths.
 * bun scripts/access-selftest.ts
 */

import { ACCESS_FORMS, handleAccessIntent, parseAccessText } from "../src/lib/pixel/access";

async function main() {
  console.log("═══ ACCESS ═══\n");
  for (const f of ACCESS_FORMS) {
    console.log(`· ${f.id.padEnd(14)} ${f.who}`);
  }

  const directory = (id: string) => {
    const map: Record<string, string> = {
      "+8801711000001": "pix1farmer_bd_aaaaaaaaaaaaaaaa",
      rina: "pix1rina_bbbbbbbbbbbbbbbbbbbbbb",
      "+16205551212": "pix1kansas_cccccccccccccccccc",
      joe: "pix1joe_dddddddddddddddddddddd",
    };
    return map[id] ?? map[id.toLowerCase()];
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
  };

  // Bangladesh — Bangla SMS
  const bd = parseAccessText("SEND rina 5 চাল", "sms", "+8801711000001", "bn");
  const bdRes = handleAccessIntent(bd, ctx);
  if (!bdRes.ledgerSend || bdRes.ledgerSend.amount !== 5) throw new Error("bd send");
  if (bdRes.reply.sms.length > 160) throw new Error("sms too long");
  console.log("\n▸ BD SMS:", bdRes.reply.sms);

  // Kansas — English USSD-style
  const ks = parseAccessText("SEND joe 12 seed", "ussd", "+16205551212", "en");
  const ksRes = handleAccessIntent(ks, ctx);
  if (!ksRes.ledgerSend || ksRes.reply.code !== "OK") throw new Error("ks send");
  console.log("▸ KS USSD:", ksRes.reply.sms);

  // Offline queue
  const off = parseAccessText("SEND rina 2", "offline_queue", "+8801711000001", "bn");
  const offRes = handleAccessIntent(off, ctx);
  if (offRes.reply.code !== "QUEUED") throw new Error("queue");
  console.log("▸ Offline:", offRes.reply.sms);

  // Balance
  const bal = handleAccessIntent(parseAccessText("BALANCE", "sms", "+16205551212", "en"), ctx);
  if (!bal.reply.sms.includes("100")) throw new Error("bal");
  console.log("▸ Balance:", bal.reply.sms);

  console.log("\n═══ PASS — same ledger, many doors ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

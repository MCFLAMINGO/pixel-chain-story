/**
 * Kindling + self-custody + energy truth.
 * bun scripts/kindling-selftest.ts
 */

import {
  Custody,
  Kindling,
  SELF_CUSTODY_AXIOM,
  Uptake,
  assertSelfCustody,
  balanceOf,
  confluentSeal,
  createGenesis,
  datacenterRebuke,
  energyTruthForIlluminate,
  forgePersonalSource,
  handleAccessIntent,
  inviteToKindleIntent,
  kindleAccept,
  kindleOffer,
  parseAccessText,
  settleKindling,
  unlockPersonalSource,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ KINDLING · SELF-CUSTODY · ENERGY ═══\n");
  console.log(SELF_CUSTODY_AXIOM);
  console.log(datacenterRebuke());
  console.log("");

  for (const step of Uptake.ladder) {
    console.log(`· ${step.tier.padEnd(10)} spend=${step.canSpend} — ${step.role}`);
  }

  const dale = await forgePersonalSource("dale");
  const joe = await forgePersonalSource("joe");
  const unlocked = await unlockPersonalSource(dale.source);
  if (unlocked.keypair.address !== dale.source.address) throw new Error("unlock address");

  // Forbidden: gateway admits it holds seed
  let blocked = false;
  try {
    assertSelfCustody({
      signerAddress: dale.source.address,
      ownerAddress: dale.source.address,
      gatewayHeldSeed: true,
    });
  } catch {
    blocked = true;
  }
  if (!blocked) throw new Error("gateway custody must fail");
  console.log("\n▸ Gateway-held seed rejected ✓");

  // Helper signing as someone else fails
  blocked = false;
  try {
    assertSelfCustody({
      signerAddress: joe.source.address,
      ownerAddress: dale.source.address,
    });
  } catch {
    blocked = true;
  }
  if (!blocked) throw new Error("helper sign must fail");
  console.log("▸ Helper signing for user rejected ✓");

  const intent = { fromLocal: "dale", toLocal: "joe", amount: 5, note: "seed corn" };
  const offer = await kindleOffer(intent);
  const accept = await kindleAccept(intent);
  const bad = await kindleAccept({ ...intent, amount: 6 });
  const mismatch = await confluentSeal(offer, bad);
  if (mismatch.ok) throw new Error("amount mismatch must fail");
  console.log("▸ Scam amount mismatch rejected ✓");

  const conf = await confluentSeal(offer, accept);
  if (!conf.ok) throw new Error(conf.reason);
  console.log("▸ Presence Seal:", conf.seal.boundLabel);

  const genesis = await createGenesis(unlocked.keypair);
  const settled = await settleKindling({
    state: genesis,
    from: unlocked.keypair,
    ownerAddress: dale.source.address,
    sequencer: unlocked.keypair,
    toAddress: joe.source.address,
    seal: conf.seal,
  });
  const afterJoe = balanceOf(settled.state, joe.source.address);
  if (afterJoe !== 5) throw new Error(`joe got ${afterJoe}`);
  if (settled.state.pixels.length < 2) throw new Error("pixel not illuminated");
  console.log("▸ Settled self-custody kindling ✓", settled.summary.slice(0, 80));

  // SMS cannot spend — only invite
  const dir = (id: string) =>
    ({ dale: dale.source.address, joe: joe.source.address })[id.toLowerCase()];
  const sms = handleAccessIntent(parseAccessText("SEND joe 5", "sms", "dale", "en"), {
    directory: dir,
    balanceOf: () => 40,
  });
  if (sms.reply.code !== "KINDLING_REQUIRED") throw new Error("sms must not spend");
  if (!inviteToKindleIntent(sms)) throw new Error("invite");
  console.log("▸ SMS invite only:", sms.reply.sms.slice(0, 60));

  const e = energyTruthForIlluminate(1);
  if (e.honesty !== "estimate-model-not-meter") throw new Error("honesty");
  if (e.polsJoules >= e.powComparableJoules) throw new Error("energy");
  console.log("▸ Energy Truth model OK");

  if (!Custody.axiom.includes("own Source")) throw new Error("axiom");
  if (!Kindling.ttlMs) throw new Error("ttl");

  console.log("\n═══ PASS — invent core, bridge uptake, self-custody law ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

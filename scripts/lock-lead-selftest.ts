/**
 * USDC lock → lattice lead activation (bridge invent).
 * Tip binds waveDigest + spatialRoot; lockDigest in shine-in reference.
 * bun run test:lock-lead
 */
import {
  LockFeeder,
  activateLeadFromLock,
  balanceOf,
  createGenesis,
  forgePersonalSource,
  generateLightKeypair,
  lockLeadThesis,
  proveIlluminatedCell,
  verifyChain,
  verifyIlluminatedCellProof,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ LOCK → LEAD ACTIVATION ═══\n");

  if (!lockLeadThesis().includes("lockDigest")) throw new Error("thesis");
  if (!/not a second activate_lead/i.test(lockLeadThesis())) throw new Error("thesis invent");
  console.log("▸ thesis ✓");

  const you = await forgePersonalSource("you");
  const vault = await generateLightKeypair();
  let state = await createGenesis(vault);
  const feeder = LockFeeder.createState();

  const rail = LockFeeder.createRail();
  const eoa = "0xLockerLead";
  LockFeeder.mintUsdc(rail, eoa, 25);
  const receipt = await LockFeeder.lockUsdc({
    rail,
    locker: eoa,
    humanUsd: 7,
    pixelRecipient: you.source.address,
  });
  const check = await LockFeeder.verifyUsdc(rail, receipt);
  if (!check.ok) throw new Error(check.reason);
  console.log("▸ USDC locked ✓", receipt.amount, receipt.asset);

  const lead = await activateLeadFromLock({
    receipt,
    ownerLocalId: "you",
    feeder,
    state,
    bridgeVault: vault,
    sequencer: vault,
    rail,
  });
  state = lead.state;

  if (balanceOf(state, you.source.address) !== 7) throw new Error("shine-in bal");
  if (!lead.shineReference.includes(receipt.lockDigest.slice(0, 16))) {
    throw new Error("lockDigest not in tip tx reference");
  }
  if (lead.leadIndex !== state.pixels.length - 1) throw new Error("leadIndex");
  if (lead.waveDigest !== state.pixels[lead.leadIndex]!.lightProof.waveDigest) {
    throw new Error("waveDigest");
  }
  if (lead.spatialRoot !== state.pixels[lead.leadIndex]!.lightProof.spatialRoot) {
    throw new Error("spatialRoot");
  }
  if (!(await verifyChain(state))) throw new Error("verify");
  console.log(
    "▸ USDC → lead tip #" + lead.leadIndex,
    "wave",
    lead.waveDigest.slice(0, 12) + "…",
    "spatial",
    lead.spatialRoot.slice(0, 12) + "…",
  );

  const cell = await proveIlluminatedCell(state.pixels, lead.leadIndex);
  if (!cell || !(await verifyIlluminatedCellProof(cell))) {
    throw new Error("lead cell proof");
  }
  console.log("▸ lead cell illuminated proof ✓", cell.coord);

  // Replay blocked
  let replay = false;
  try {
    await activateLeadFromLock({
      receipt,
      ownerLocalId: "you",
      feeder,
      state,
      bridgeVault: vault,
      sequencer: vault,
      rail,
    });
  } catch {
    replay = true;
  }
  if (!replay) throw new Error("replay allowed");
  console.log("▸ double lead activation rejected ✓");

  // LockFeeder.activateLead alias
  const receipt2 = await LockFeeder.lockUsdc({
    rail,
    locker: eoa,
    humanUsd: 3,
    pixelRecipient: you.source.address,
  });
  const lead2 = await LockFeeder.activateLead({
    receipt: receipt2,
    ownerLocalId: "you",
    feeder,
    state,
    bridgeVault: vault,
    sequencer: vault,
    rail,
  });
  if (lead2.pixCredited !== 3) throw new Error("alias credit");
  if (lead2.leadIndex <= lead.leadIndex) throw new Error("tip advanced");
  console.log("▸ LockFeeder.activateLead alias ✓ tip #" + lead2.leadIndex);

  console.log("\n═══ PASS — USDC lock activates tip lead ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

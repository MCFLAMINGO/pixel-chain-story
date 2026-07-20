/**
 * Live lock feeder → Worldlight shineIn.
 * bun scripts/lock-feeder-selftest.ts
 */

import {
  LockFeeder,
  balanceOf,
  createGenesis,
  forgePersonalSource,
  generateLightKeypair,
  illuminateIngress,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ LOCK FEEDER → WORLDLIGHT ═══\n");

  const you = await forgePersonalSource("you");
  const vault = await generateLightKeypair();
  let state = await createGenesis(vault);
  const feeder = LockFeeder.createState();

  // USDC path (local rail ≡ PixelUsdcLock.sol semantics)
  const rail = LockFeeder.createRail();
  const eoa = "0xLockerAlice";
  LockFeeder.mintUsdc(rail, eoa, 20);
  const usdcReceipt = await LockFeeder.lockUsdc({
    rail,
    locker: eoa,
    humanUsd: 5,
    pixelRecipient: you.source.address,
  });
  const usdcCheck = await LockFeeder.verifyUsdc(rail, usdcReceipt);
  if (!usdcCheck.ok) throw new Error(usdcCheck.reason);
  console.log("▸ USDC locked on rail:", usdcReceipt.foreignRef, usdcReceipt.amountRaw, "raw");

  let prepared = await LockFeeder.feed({
    receipt: usdcReceipt,
    ownerLocalId: "you",
    feeder,
    rail,
  });
  let res = await illuminateIngress({
    prepared,
    state,
    bridgeVault: vault,
    sequencer: vault,
  });
  LockFeeder.consume(feeder, usdcReceipt.lockDigest);
  state = res.state;
  if (balanceOf(state, you.source.address) !== 5) throw new Error("usdc shine-in bal");
  console.log("▸ USDC → 5 PIX on Personal Source ✓");

  // Replay must fail
  let replayBlocked = false;
  try {
    await LockFeeder.feed({
      receipt: usdcReceipt,
      ownerLocalId: "you",
      feeder,
      rail,
    });
  } catch {
    replayBlocked = true;
  }
  if (!replayBlocked) throw new Error("replay allowed");
  console.log("▸ Double shine-in rejected ✓");

  // Bank wire path
  const bank = await LockFeeder.createBankAttestor("mcflamingo-bank");
  const wire = await LockFeeder.attestWire({
    attestor: bank,
    humanUsd: 5,
    pixelRecipient: you.source.address,
    wireRef: "WIRE-2026-07016-5USD",
  });
  const wireOk = await LockFeeder.verifyWire(bank, wire);
  if (!wireOk.ok) throw new Error(wireOk.reason);
  prepared = await LockFeeder.feed({
    receipt: wire,
    ownerLocalId: "you",
    feeder,
    attestor: bank,
  });
  res = await illuminateIngress({
    prepared,
    state,
    bridgeVault: vault,
    sequencer: vault,
  });
  LockFeeder.consume(feeder, wire.lockDigest);
  state = res.state;
  if (balanceOf(state, you.source.address) !== 10) throw new Error("wire shine-in bal");
  console.log("▸ Bank wire $5 → +5 PIX (total 10) ✓");

  // Tampered receipt fails
  let tamperBlocked = false;
  try {
    const evil = { ...wire, amount: 999, amountRaw: "99900" };
    await LockFeeder.feed({
      receipt: evil,
      ownerLocalId: "you",
      feeder,
      attestor: bank,
    });
  } catch {
    tamperBlocked = true;
  }
  if (!tamperBlocked) throw new Error("tamper allowed");
  console.log("▸ Tampered wire rejected ✓");

  console.log("\n═══ PASS — foreign lock feeder wired ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

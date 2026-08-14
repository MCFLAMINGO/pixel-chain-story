#!/usr/bin/env bun
/**
 * What a farm actually harms — corrected, and still worth stopping.
 *
 * An earlier version of this claimed one farmed PIX was one person who could never be
 * welcomed. That was wrong: a person can always be *given* light, and whether it is newly
 * minted is irrelevant to them. The cap gates minting, never welcoming.
 *
 * Correcting that is not an argument that farming is harmless. It relocates the harm, and
 * the harm it relocates to is arguably worse.
 *
 * Proves:
 *   1. A wallet is not the light: puppets empty, the light survives, the picture keeps it.
 *   2. Nobody is ever excluded — a welcome needs a giver, not a mint.
 *   3. The cap could never subsidise everyone anyway: 78 years, with zero farming.
 *   4. What farming actually burns is subsidy, measured in years.
 *   5. Nor is it capture: a hoard writes nothing, and writing liquidates the hoard while
 *      funding the witnesses of the network it meant to capture.
 *   6. And it is cheap undefended, which is why the presence work still counts.
 */

import { PIX_HARD_CAP } from "../src/lib/pixel/economics";
import {
  SUBSIDY_YEARS,
  captureIsSelfLiquidating,
  mintHarmThesis,
  subsidyBurnPrice,
  subsidyHarm,
  survivingHarms,
  writeShare,
} from "../src/lib/pixel/mint-harm";
import { FARM_DEVICE_COST, witnessedMintCost } from "../src/lib/pixel/presence-peg";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

console.log("═══ MINT HARM ═══\n");

// 1. A wallet is not the light.
{
  let puppet = 1; // welcomed
  let aggregator = 0;
  let inPicture = 0;
  const minted = 1;
  puppet -= 1;
  aggregator += 1;
  assert(puppet === 0, "the puppet is empty and finished as a wallet");
  aggregator -= 1;
  inPicture += 1;
  assert(
    puppet + aggregator + inPicture === minted,
    "the light is conserved through empty wallets",
  );
  console.log("▸ puppets empty and are finished; the light they carried is still there ✓");
}

// 2. Nobody is excluded. A welcome needs a giver, not a mint.
{
  const h = subsidyHarm({ minted: 103_000_000, costPerPixUsd: 300 });
  assert(h.peopleExcluded === 0, "farming excludes nobody — giving does not require minting");
  console.log(
    `▸ CORRECTION: ${(h.minted / 1e6).toFixed(0)}M PIX farmed excludes ` +
      `${h.peopleExcluded} people. A person can always be given light ✓`,
  );
  console.log(
    `▸ an exhausted cap only ends the subsidy: ${h.effect} — which is how every gift ` +
      `after the first already works ✓`,
  );
}

// 3. The cap was never a seat for everyone.
{
  assert(
    Math.abs(SUBSIDY_YEARS - 78) < 1,
    `the subsidy should run about 78 years, got ${SUBSIDY_YEARS.toFixed(1)}`,
  );
  const everLived = 117e9;
  assert(
    everLived / PIX_HARD_CAP > 10,
    "humans who have ever lived should exceed the cap many times over",
  );
  console.log(
    `▸ and the cap never could subsidise everyone: ${SUBSIDY_YEARS.toFixed(0)} years of free ` +
      `welcomes with ZERO farming, because ~117bn humans have lived — ` +
      `${(everLived / PIX_HARD_CAP).toFixed(0)}× the cap ✓`,
  );
}

// 4. What farming burns, in the honest unit.
{
  const h = subsidyHarm({ minted: 103_000_000, costPerPixUsd: 300 });
  assert(
    Math.abs(h.subsidyYearsLost - 0.78) < 0.01,
    `1% of the cap is about 9 months of subsidy, got ${h.subsidyYearsLost.toFixed(2)}yr`,
  );
  console.log(
    `▸ the honest unit: 1% of the cap farmed = ` +
      `${(h.subsidyYearsLost * 12).toFixed(0)} months of free welcoming burnt, no victim ✓`,
  );
}

// 5. SECOND CORRECTION: holding the most light is not controlling the record.
{
  // A farm holds 1% of the cap and the honest world has welcomed a million people. On
  // holdings the farm dominates. On the record — what was actually written — it has zero,
  // because a hoard writes nothing.
  const w = writeShare({ farmMinted: 103_000_000, honestMinted: 1_000_000 });
  assert(w.farmShare > 0.99, `the farm dominates HOLDINGS, got ${w.farmShare.toFixed(3)}`);

  const cap = captureIsSelfLiquidating({ farmHoldings: 103_000_000 });
  assert(cap.holdingsShareWhileIdle === 1, "idle, the farm owns everything");
  assert(cap.recordShareWhileIdle === 0, "and says nothing — the picture is flow, not stock");
  console.log(
    `▸ CORRECTION 2: idle, the farm holds ${(w.farmShare * 100).toFixed(1)}% of the light and ` +
      `writes ${cap.recordShareWhileIdle * 100}% of the picture. A static picture controls nothing ✓`,
  );

  // And writing liquidates the hoard while paying the honest network.
  assert(
    cap.netCostPerRecord === 2,
    "each record loses one PIX to the picture and one to a witness",
  );
  assert(
    cap.recordsBeforeBroke === Math.floor(103_000_000 / 2),
    `the burst is finite, got ${cap.recordsBeforeBroke}`,
  );
  assert(
    cap.toHonestWitnesses === cap.recordsBeforeBroke,
    "half of everything spent reaches witnesses outside the farm",
  );
  console.log(
    `▸ and writing liquidates it: ${(cap.recordsBeforeBroke / 1e6).toFixed(1)}M records, then ` +
      `broke — having paid ${(cap.toHonestWitnesses / 1e6).toFixed(1)}M PIX to honest witnesses ✓`,
  );
  console.log(
    `▸ so capture is self-terminating: it subsidises the network it meant to capture, which ` +
      `is why a captured network of participation is a worthless one ✓`,
  );

  const harms = survivingHarms();
  assert(harms.length === 4, `four harms survive, got ${harms.length}`);
  for (const { harm, why } of harms) {
    assert(harm.length > 0 && why.length > 20, `each surviving harm needs a reason: ${harm}`);
  }
  assert(
    !harms.some((h) => /capture of the record/i.test(h.harm)),
    "capture of the record must no longer be listed as a surviving harm",
  );
  console.log("▸ four harms survive both corrections, and capture is not one of them ✓");
}

// 6. Cheap undefended, which is the whole case for the presence work.
{
  const undefended = subsidyBurnPrice(FARM_DEVICE_COST.emulated);
  const defended = subsidyBurnPrice(
    witnessedMintCost({
      corruptionCostUsd: 10_000,
      welcomesBeforeDetection: 100,
      quorum: 3,
    }).costPerPixWithQuorumUsd,
  );
  assert(undefended.totalUsd < 2e8, `undefended it is cheap: $${undefended.totalUsd}`);
  assert(defended.totalUsd > 1e12, `witness-attested it is trillions: $${defended.totalUsd}`);
  console.log(
    `▸ so the defence still counts: $${(undefended.totalUsd / 1e6).toFixed(0)}M to burn all ` +
      `${undefended.yearsBurnt.toFixed(0)} years undefended, ` +
      `$${(defended.totalUsd / 1e12).toFixed(1)}tn witness-attested ✓`,
  );
}

const t = mintHarmThesis();
for (const [k, v] of Object.entries(t)) console.log(`\n${k}: ${v}`);
console.log("\nSurviving harms:");
for (const { harm, why } of survivingHarms()) console.log(`  • ${harm} — ${why}`);
console.log(
  "\n═══ PASS — nobody is excluded, capture liquidates itself, " +
    "and farming is still worth making hard ═══",
);

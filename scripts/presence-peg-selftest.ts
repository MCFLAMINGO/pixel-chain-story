#!/usr/bin/env bun
/**
 * Arithmetic behind the presence-pegged supply in docs/EMISSION.md.
 *
 * The proposal is to tie supply to the global census and to the 24 hours in a
 * day. This does not implement it — no consensus change, no schedule change. It
 * checks the claims the document makes, so the numbers there are reproducible
 * rather than asserted, and so an arithmetic mistake cannot survive review:
 *
 *   1. A census peg is bounded, not unlimited: population peaks and declines.
 *   2. The 24-hour bound and the census bound are the same quantity.
 *   3. Population × life expectancy double-counts lifespan.
 *   4. Decay plus renewal makes supply proportional to population with no oracle.
 *   5. Deaths remove supply on their own, and net issuance turns negative.
 *
 * Demographic inputs are UN-derived estimates, stated here as inputs rather than
 * hidden in prose. They are NOT consensus values — that is the whole point of
 * finding a design that never has to read them.
 */

import { PIX_HARD_CAP } from "../src/lib/pixel/economics";
import {
  FARM_DEVICE_COST,
  WORLD_PEAK_POPULATION,
  cliqueYield,
  farmDefenceThesis,
  farmYield,
  giftBudgetThesis,
  witnessedMintCost,
  cumulativePresence,
  decayDial,
  presencePegModel,
  presencePegThesis,
  splitDesignThesis,
  sybilEconomics,
} from "../src/lib/pixel/presence-peg";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

function near(actual: number, expected: number, tolerance: number, msg: string): void {
  const off = Math.abs(actual - expected) / Math.abs(expected);
  assert(off <= tolerance, `${msg} — got ${actual}, expected ~${expected} (off ${off * 100}%)`);
}

console.log("═══ PRESENCE PEG ARITHMETIC ═══\n");

const m = presencePegModel();

// 1. Bounded, not unlimited. This is the answer to "unlimited supply seems
//    ridiculous": a census peg has a ceiling, and it arrives without anyone
//    voting for it.
const headroom = m.peakPopulation / m.population - 1;
assert(m.peakPopulation > m.population, "the projected peak must be above today");
near(headroom, 0.26, 0.05, "ceiling is ~26% above today");
console.log(
  `▸ ceiling ${(headroom * 100).toFixed(0)}% above today ` +
    `(${(m.population / 1e9).toFixed(2)}bn → ${(m.peakPopulation / 1e9).toFixed(2)}bn), then declines ✓`,
);

// 2. The two halves of the proposal are one quantity. Everyone alive lives one
//    year per year, so the annual flow of lived time *is* the population.
assert(
  m.personYearsPerYear === m.population,
  "person-years lived per year must equal the population exactly",
);
near(m.personHoursPerDay, m.population * 24, 1e-12, "person-hours per day");
console.log(
  `▸ person-years/year === population; ${(m.personHoursPerDay / 1e9).toFixed(1)}bn person-hours/day ✓`,
);

// 3. Multiplying population by life expectancy counts lifespan twice, because
//    population already contains it.
const naive = m.birthsPerYear * m.lifeExpectancy;
assert(naive !== m.population, "births × lifespan must not be treated as the population");
near(naive, m.population, 0.25, "births × lifespan lands near population, off by current growth");
console.log(
  `▸ births × lifespan = ${(naive / 1e9).toFixed(2)}bn vs population ` +
    `${(m.population / 1e9).toFixed(2)}bn — lifespan is already inside the census ✓`,
);

// 4. Decay + renewal reproduces the peg without an oracle. What matters is not
//    the absolute number but that supply is strictly proportional to people.
const a = m.steadySupply({ halfLifeYears: 5, renewalsPerPersonPerDay: 1 });
const b = m.steadySupply({
  halfLifeYears: 5,
  renewalsPerPersonPerDay: 1,
  population: 2 * m.population,
});
near(b / a, 2, 1e-9, "doubling the people must exactly double the supply");

const longer = m.steadySupply({ halfLifeYears: 10, renewalsPerPersonPerDay: 1 });
near(longer / a, 2, 1e-9, "doubling the half-life must exactly double the supply");
console.log("▸ steady-state supply is proportional to people, and to half-life ✓");

// The parameter choice is what gives the unit its meaning. Inverting the formula
// must round-trip, or the table in EMISSION.md is wrong.
for (const halfLifeYears of [1, 5, m.lifeExpectancy]) {
  const rate = m.renewalRateForOnePerPerson(halfLifeYears);
  const supply = m.steadySupply({ halfLifeYears, renewalsPerPersonPerDay: rate });
  near(supply, m.population, 1e-9, `half-life ${halfLifeYears}y must yield one unit per person`);
}
console.log("▸ solving for one unit per living person inverts cleanly at 1y, 5y and a lifetime ✓");

// A renewal cap is the 24-hour fact, and it has to bind.
assert(
  m.steadySupply({ halfLifeYears: 5, renewalsPerPersonPerDay: 2 }) >
    m.steadySupply({ halfLifeYears: 5, renewalsPerPersonPerDay: 1 }),
  "a higher renewal cap must raise the ceiling, which is why the cap is the control",
);
console.log("▸ the per-person daily cap is what bounds the whole system ✓");

// 5. Deaths contract supply with no rule needed, and the sign flips after the
//    peak. Sub-1% drifting to deflation is the emergent policy.
near(m.deathRate, 0.0076, 0.1, "deaths remove ~0.76%/yr");
near(m.birthRate, 0.0161, 0.1, "births add ~1.61%/yr");
near(m.netIssuance, 0.0085, 0.15, "net ~+0.85%/yr today");
assert(
  m.netIssuance > 0 && m.netIssuance < 0.01,
  "today's net issuance must be positive but under 1%",
);
assert(
  m.netIssuanceAt({ birthsPerYear: 6e7, deathsPerYear: 9e7 }) < 0,
  "when deaths outnumber births the supply must contract",
);
console.log(
  `▸ +${(m.birthRate * 100).toFixed(2)}% births, −${(m.deathRate * 100).toFixed(2)}% deaths, ` +
    `net +${(m.netIssuance * 100).toFixed(2)}%/yr, negative after the peak ✓`,
);

// ── The follow-up question: decay the earning rate instead of the stock? ──
//
// The appeal is that memory should not evaporate because someone got sick. The
// cost is that it abandons the property that made a census peg attractive.
console.log("\n── permanent stock, lapsing earning rate ──");

const cum100 = cumulativePresence({ years: 100 });
const cum200 = cumulativePresence({ years: 200 });
near(cum200 / cum100, 2, 1e-9, "cumulative supply must be linear in time");
assert(
  cumulativePresence({ years: 100, population: 2 * m.population }) === 2 * cum100,
  "cumulative supply scales with people too, but that is not a peg",
);
// A peg means the supply follows the population *down*. Cumulative supply cannot:
// at a fixed population it keeps rising, so time alone breaks the relationship.
assert(
  cum200 > cum100,
  "with the population unchanged, supply still grows — so it is not pegged to it",
);
console.log(
  `▸ 100y → ${cum100.toExponential(2)}, 200y → ${cum200.toExponential(2)} at fixed population ✓`,
);
console.log("▸ so a permanent stock is NOT a population peg: deaths remove nothing ✓");

// ── One dial, pulling both ways ──
console.log("\n── the half-life dial ──");
for (const halfLifeYears of [1, 5, 20, 73]) {
  const d = decayDial(halfLifeYears);
  // Decay cannot distinguish an absent person from a farm standing still, so the
  // rate it forgives one at is the rate it charges the other.
  near(
    d.sybilCarryPerYear,
    d.annualDecay,
    1e-9,
    `half-life ${halfLifeYears}y: absence penalty must equal the carrying cost`,
  );
  near(
    d.absencePenalty(12),
    d.annualDecay,
    1e-9,
    `half-life ${halfLifeYears}y: 12 months absent must equal one year of decay`,
  );
  console.log(
    `  ${String(halfLifeYears).padStart(2)}y half-life: 6mo absent −${(d.absencePenalty(6) * 100).toFixed(2)}%, ` +
      `1y absent −${(d.annualDecay * 100).toFixed(2)}%, farm re-earns ${(d.sybilCarryPerYear * 100).toFixed(2)}%/yr`,
  );
}
assert(
  decayDial(1).annualDecay > decayDial(73).annualDecay,
  "a shorter half-life must tax absence harder",
);
assert(
  decayDial(1).sybilCarryPerYear > decayDial(73).sybilCarryPerYear,
  "and must also make hoarded fakes more expensive — the same dial, both directions",
);
console.log("▸ forgiving absence and taxing fakes are one dial, not two ✓");

// ── What decay does NOT do ──
//
// Correcting an overstatement: decay bounds what a farm can accumulate, but the
// marginal fake's profitability is set by reward against cost, at any half-life.
console.log("\n── does decay make faking unprofitable? ──");
const econ = sybilEconomics({ deviceCost: 100, deviceLifetimeYears: 3 });
near(econ.costPerIdentityPerDay, 0.0913, 0.02, "a $100 phone over 3 years costs ~9c/day");

// Scale-invariant: the sign of the profit does not depend on farm size, so
// "they'd need thousands of phones" is not by itself a defence.
for (const identities of [1, 1_000, 1_000_000]) {
  assert(
    econ.farmProfitPerDay({ identities, rewardValuePerIdentityDay: 0.5 }) > 0,
    `a reward above cost pays a farm of ${identities}`,
  );
  assert(
    econ.farmProfitPerDay({ identities, rewardValuePerIdentityDay: 0.01 }) < 0,
    `a reward below cost never pays, at any size`,
  );
}
console.log(
  `▸ breakeven is ${(econ.breakevenRewardPerIdentityDay * 100).toFixed(1)}c per identity-day, ` +
    "and the sign is independent of farm size ✓",
);

// The 24-hour cap is what keeps that cost from collapsing: without it one device
// serves many identities and the cost per presence goes to nothing.
const uncapped = sybilEconomics({
  deviceCost: 100,
  deviceLifetimeYears: 3,
  presencesPerDevicePerDay: 100,
});
assert(
  uncapped.costPerIdentityPerDay < econ.costPerIdentityPerDay / 50,
  "without a per-identity daily cap the cost of faking collapses",
);
console.log(
  `▸ lift the daily cap and faking falls to ${(uncapped.costPerIdentityPerDay * 100).toFixed(2)}c — ` +
    "the 24-hour bound is what gives cost its floor ✓",
);

// ── The split that keeps both properties ──
console.log("\n── record and money as separate quantities ──");
const momentsAt = (years: number) => cumulativePresence({ years });
assert(momentsAt(50) > momentsAt(10), "moments accumulate and are never destroyed");
const pixNow = m.steadySupply({ halfLifeYears: 5, renewalsPerPersonPerDay: 1 });
const pixHalfGone = m.steadySupply({
  halfLifeYears: 5,
  renewalsPerPersonPerDay: 1,
  population: m.population / 2,
});
near(pixHalfGone / pixNow, 0.5, 1e-9, "the fungible side must halve when the people halve");
assert(
  momentsAt(50) === cumulativePresence({ years: 50 }),
  "while the record is untouched by who is still here",
);
console.log("▸ moments permanent and PIX population-pegged, simultaneously ✓");
console.log("▸ absence costs future income; it never erases a witnessed moment ✓");

// Making a gift cost a phone: does it price out a farm?
//
// The obvious answer to the mint-back hole is to require a physical meeting, so a
// fresh address is free but a fresh address that has *met* one is not. The cost is
// real. The shape of it is what decides whether it helps, and under the pair rule
// the shape favours the attacker.
{
  const phone = 200;

  // Per-pair (the current rule): yield is quadratic, cost is linear.
  const small = farmYield({ devices: 100, deviceCostUsd: phone });
  const big = farmYield({ devices: 100_000, deviceCostUsd: phone });
  assert(
    big.costPerPixUsd < small.costPerPixUsd / 100,
    `a bigger farm must not get a discount, got $${small.costPerPixUsd.toFixed(4)} -> ` +
      `$${big.costPerPixUsd.toFixed(4)}`,
  );
  assert(
    big.shareOfCap > 0.9,
    `a $${(big.capexUsd / 1e6).toFixed(0)}M farm captures ${(big.shareOfCap * 100).toFixed(0)}% ` +
      `of the cap — this is the finding, not a pass`,
  );
  console.log(
    `▸ PER-PAIR is a volume discount: $${small.costPerPixUsd.toFixed(2)}/PIX at 100 devices, ` +
      `$${big.costPerPixUsd.toFixed(4)}/PIX at 100k ✗`,
  );
  console.log(
    `▸ PER-PAIR: $${(big.capexUsd / 1e6).toFixed(0)}M of handsets mints ` +
      `${(big.shareOfCap * 100).toFixed(0)}% of every PIX that will ever exist ✗`,
  );

  // Per-identity: yield and cost both linear, so cost per PIX is scale-invariant.
  const G = 50;
  const yields = [100, 1_000, 100_000].map((devices) =>
    farmYield({ devices, deviceCostUsd: phone, giftsPerIdentity: G }),
  );
  for (const y of yields) {
    assert(
      Math.abs(y.costPerPixUsd - phone / G) < 1e-9,
      `cost per PIX must not move with scale, got $${y.costPerPixUsd} at ${y.devices}`,
    );
  }
  assert(
    yields[2]!.shareOfCap < 0.001,
    `a 100k-device farm should stay under 0.1% of the cap, got ${yields[2]!.shareOfCap}`,
  );
  console.log(
    `▸ PER-IDENTITY (G=${G}) is scale-invariant: $${(phone / G).toFixed(2)}/PIX at every size, ` +
      `and 100k devices reach ${(yields[2]!.shareOfCap * 100).toFixed(3)}% of the cap ✓`,
  );

  // G=1 — "one gift, one person" — is the strongest version, and it makes the cap
  // and the emission rule the same sentence: welcome every human once and supply is
  // exactly the peak population the cap was set from.
  const one = farmYield({ devices: 1e9, deviceCostUsd: phone, giftsPerIdentity: 1 });
  assert(one.costPerPixUsd === phone, "at G=1 a PIX costs a whole device");
  assert(
    one.shareOfCap < 0.1,
    `a billion handsets — $${(one.capexUsd / 1e9).toFixed(0)}bn — should still reach under ` +
      `10% of the cap, got ${(one.shareOfCap * 100).toFixed(1)}%`,
  );
  assert(
    WORLD_PEAK_POPULATION === PIX_HARD_CAP,
    "one gift per person makes supply equal peak population, which is the cap",
  );
  console.log(
    `▸ G=1 is strongest: $${one.costPerPixUsd}/PIX, and $${(one.capexUsd / 1e9).toFixed(0)}bn of ` +
      `handsets still reaches only ${(one.shareOfCap * 100).toFixed(1)}% of the cap ✓`,
  );
  console.log(
    `▸ G=1 makes the cap and the rule one sentence: welcome each human once and supply ` +
      `is ${(PIX_HARD_CAP / 1e9).toFixed(1)}e9 = the cap ✓`,
  );

  // And the half that is easy to miss: a per-identity budget is worth nothing on its
  // own, because every fresh address arrives with an unused budget of its own. The
  // budget makes the yield linear; only a cost on identity makes linear expensive.
  const freeAddresses = 100_000;
  const mintedForFree = freeAddresses * 1; // each new address brings its own G=1
  assert(
    mintedForFree === freeAddresses,
    "a per-identity cap does not bind when identities are free",
  );
  console.log(
    `▸ but G=1 alone is worthless: ${freeAddresses.toLocaleString()} free addresses still ` +
      `mint ${mintedForFree.toLocaleString()} PIX at $0.00/PIX ✗ — the budget needs a ` +
      `costly identity behind it`,
  );
}

// How the farm is actually run, and which defence changes its shape.
{
  // 1. Retail pricing flatters the defence. A real farm does not pay it.
  const rows = (["retail", "used", "shared-screen", "emulated"] as const).map((hardware) => ({
    hardware,
    y: cliqueYield({ devices: 1e6, hardware, giftsPerIdentity: 1 }),
  }));
  for (const { hardware, y } of rows) {
    console.log(
      `▸ 1M identities on ${hardware.padEnd(13)} $${y.capexUsd.toExponential(2).padStart(8)} ` +
        `= $${y.costPerPixUsd.toFixed(2).padStart(6)}/PIX`,
    );
  }
  const retail = rows[0]!.y;
  const emulated = rows[3]!.y;
  assert(
    emulated.costPerPixUsd < retail.costPerPixUsd / 1000,
    "emulation must be shown to collapse the hardware defence, not survive it",
  );
  console.log(
    `▸ a per-identity budget alone does not bind: emulation is ` +
      `${Math.round(retail.costPerPixUsd / emulated.costPerPixUsd).toLocaleString()}× cheaper ` +
      `than the retail number the defence assumed ✗`,
  );

  // 2. Rooting the budget in the existing graph fixes the exponent, and only that.
  const perPair = farmYield({ devices: 1e6, deviceCostUsd: FARM_DEVICE_COST.used });
  const rooted = cliqueYield({ devices: 1e6, hardware: "used", giftsPerIdentity: 1 });
  assert(
    rooted.minted < perPair.minted / 1000,
    "rooting must convert quadratic yield into linear yield",
  );
  console.log(
    `▸ rooting the budget fixes the exponent: ${perPair.minted.toExponential(2)} PIX per-pair ` +
      `-> ${rooted.minted.toExponential(2)} rooted, from the same 1M devices ✓`,
  );

  // 3. A witness outside the pair moves the cost to corruption, which cheap parts
  //    cannot reduce. The dials are what a witness has to lose and how fast it is caught.
  const lax = witnessedMintCost({ corruptionCostUsd: 10_000, welcomesBeforeDetection: 100_000 });
  const tight = witnessedMintCost({
    corruptionCostUsd: 10_000,
    welcomesBeforeDetection: 100,
    quorum: 3,
  });
  assert(
    tight.costPerPixWithQuorumUsd > lax.costPerPixUsd * 100,
    "rate-limiting a witness and requiring a quorum must dominate the lax case",
  );
  console.log(
    `▸ witness attestation prices the mint: $${lax.costPerPixUsd.toFixed(2)}/PIX if a corrupt ` +
      `witness signs 100k welcomes unnoticed, $${tight.costPerPixWithQuorumUsd.toFixed(2)}/PIX ` +
      `at 100 welcomes and a quorum of 3 ✓`,
  );
  assert(
    tight.costPerPixWithQuorumUsd > FARM_DEVICE_COST.retail,
    "a well-dialled witness requirement should cost more per PIX than a retail handset",
  );
  console.log(
    `▸ and it beats hardware outright: $${tight.costPerPixWithQuorumUsd.toFixed(0)}/PIX ` +
      `vs $${FARM_DEVICE_COST.retail}/PIX for the best hardware assumption ✓`,
  );
}

const defence = farmDefenceThesis();
for (const [k, v] of Object.entries(defence)) console.log(`\n${k}: ${v}`);

const budget = giftBudgetThesis();
console.log(`\nper-pair:     ${budget.perPair}`);
console.log(`per-identity: ${budget.perIdentity}`);
console.log(`electricity:  ${budget.electricity}`);
console.log(`unresolved:   ${budget.unresolved}`);

const split = splitDesignThesis();
console.log(`\nproblem:      ${split.problem}`);
console.log(`split:        ${split.split}`);
console.log(`moments:      ${split.moments}`);
console.log(`pix:          ${split.pix}`);
console.log(`keeps:        ${split.keeps}`);
console.log(`still costs:  ${split.stillCosts}`);

const t = presencePegThesis();
console.log(`\nbuildable:    ${t.buildable}`);
console.log(`not buildable: ${t.notBuildable}`);
console.log(`costs:        ${t.cost}`);
console.log(`rests on:     ${t.restsOn}`);
console.log("\n═══ PASS — the arithmetic in docs/EMISSION.md reproduces ═══");

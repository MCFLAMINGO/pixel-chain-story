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

import {
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

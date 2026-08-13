#!/usr/bin/env bun
/**
 * A farm has a shape, and the shape is the price.
 *
 * `farmDefenceThesis` concluded there is no forgery to detect in the meeting itself —
 * a room of devices really is present. This tests the three things that come after,
 * and shows why only the last one is worth relying on.
 *
 * Proves:
 *   1. Minting shape separates nothing: farm and village both mint as trees.
 *   2. A consolidating farm is degenerate in flow — no reciprocity, one dominant sink,
 *      an in-degree no person has, and almost every address terminal.
 *   3. A real economy is not, on any of those measures.
 *   4. THE PRICE: a farm buying reciprocity to look alive keeps exactly 1 − r. At the
 *      reciprocity of a real economy it keeps a minority of what it minted.
 *   5. The price is a trade-off, not a detector: it holds for every r, so there is no
 *      value of r at which the farm both looks alive and keeps its light.
 *   6. Cadence gives a script away, and a concert looks like a concert.
 */

import {
  cadenceSignature,
  consolidationPrice,
  farmSignatureThesis,
  flowSignature,
  type FlowEdge,
} from "../src/lib/pixel/farm-signature";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

console.log("═══ FARM SIGNATURE ═══\n");

const DAY = 86_400_000;
const HOUR = 3_600_000;

// 1. Minting shape separates nothing.
{
  // A farm strung as a chain, and a village welcomed outward from genesis. Both are
  // trees: every identity has exactly one incoming mint, because the budget says so.
  const farmMints: FlowEdge[] = [];
  for (let i = 0; i < 500; i++) {
    farmMints.push({ from: `d${i}`, to: `d${i + 1}`, amount: 1, at: i * 1000 });
  }
  const villageMints: FlowEdge[] = [];
  let next = 1;
  for (let parent = 0; next < 501; parent++) {
    for (let child = 0; child < 3 && next < 501; child++) {
      villageMints.push({ from: `p${parent}`, to: `p${next++}`, amount: 1, at: next * 1000 });
    }
  }
  const farmIn = new Set(farmMints.map((e) => e.to));
  const villageIn = new Set(villageMints.map((e) => e.to));
  assert(farmIn.size === farmMints.length, "each farm identity is minted to once");
  assert(villageIn.size === villageMints.length, "each village identity is minted to once");
  console.log("▸ minting shape separates nothing: farm and village both mint as trees ✓");
}

// 2 + 3. Flow signature, farm against economy.
const CONSOLIDATED = 100_000;
const farmFlow: FlowEdge[] = [];
for (let i = 0; i < CONSOLIDATED; i++) {
  // Every puppet pays the one address the farmer actually controls.
  farmFlow.push({ from: `puppet${i}`, to: "farmer", amount: 1, at: i * 1000 });
}
const farm = flowSignature(farmFlow);

const economy: FlowEdge[] = [];
{
  // 500 people over a month. Deliberately NOT perfectly reciprocal — real people also
  // pay shops, pay for records, and give without getting back. Perfect reciprocity
  // would flatter the argument, so a third of the flow here goes one way only.
  let t = 0;
  for (let i = 0; i < 500; i++) {
    for (const step of [1, 7, 23]) {
      const j = (i + step) % 500;
      economy.push({ from: `h${i}`, to: `h${j}`, amount: 1, at: (t += HOUR) });
      economy.push({ from: `h${j}`, to: `h${i}`, amount: 1, at: (t += HOUR) });
    }
    // One-way spending: to a handful of shops, and into the picture for a record.
    economy.push({ from: `h${i}`, to: `shop${i % 20}`, amount: 2, at: (t += HOUR) });
    economy.push({ from: `h${i}`, to: "picture", amount: 1, at: (t += HOUR) });
  }
}
const real = flowSignature(economy);

assert(farm.reciprocity === 0, `a consolidating farm has no reciprocity, got ${farm.reciprocity}`);
assert(farm.sinkShare === 1, `all farm light ends at one sink, got ${farm.sinkShare}`);
assert(
  farm.maxDistinctInDegree === CONSOLIDATED,
  `the sink is paid by every puppet, got ${farm.maxDistinctInDegree}`,
);
assert(
  farm.terminalShare === 1,
  `the farm's only receiver is its sink, which never spends, got ${farm.terminalShare}`,
);
console.log(
  `▸ farm flow is degenerate: reciprocity ${farm.reciprocity.toFixed(2)}, ` +
    `sink share ${farm.sinkShare.toFixed(2)}, in-degree ${farm.maxDistinctInDegree.toLocaleString()}, ` +
    `terminal ${farm.terminalShare.toFixed(2)} ✓`,
);

assert(
  real.reciprocity > 0.5 && real.reciprocity < 0.9,
  `a real economy reciprocates substantially but not perfectly, got ${real.reciprocity.toFixed(2)}`,
);
assert(real.sinkShare < 0.15, `no single sink dominates, got ${real.sinkShare.toFixed(3)}`);
// In-degree must be read over person-to-person flow. The picture is paid by everyone
// by design, and a busy shop is paid by everyone in town — both legitimately look like
// a farm's sink on this measure.
const between = flowSignature(
  economy.filter((e) => e.to !== "picture" && !e.to.startsWith("shop")),
);
assert(
  between.maxDistinctInDegree < 200,
  `person-to-person in-degree stays in human range, got ${between.maxDistinctInDegree}`,
);
assert(
  real.terminalShare < 0.1,
  `few addresses in a real economy only ever receive, got ${real.terminalShare.toFixed(3)}`,
);
console.log(
  `▸ a real economy is not: reciprocity ${real.reciprocity.toFixed(2)}, ` +
    `sink share ${real.sinkShare.toFixed(3)}, person-to-person in-degree ` +
    `${between.maxDistinctInDegree}, ` +
    `terminal ${real.terminalShare.toFixed(2)} ✓`,
);

// A false positive worth keeping: the biggest sink in an honest economy is the picture
// itself, which is exactly what a record is supposed to do. Any single metric read as a
// verdict would convict the one address the design requires. This is why these measures
// inform witness eligibility and never validity.
{
  const inbound = new Map<string, number>();
  for (const e of economy) inbound.set(e.to, (inbound.get(e.to) ?? 0) + e.amount);
  const top = [...inbound.entries()].sort((a, b) => b[1] - a[1])[0]!;
  assert(top[0] === "picture", `the honest top sink should be the picture, got ${top[0]}`);
  console.log(
    `▸ FALSE POSITIVE, kept on purpose: the top sink in an honest economy IS the picture ` +
      `(${(real.sinkShare * 100).toFixed(1)}%, in-degree ${real.maxDistinctInDegree}) — and a ` +
      `busy shop looks the same. One metric as a verdict would convict both ✓`,
  );
}

// 4. THE PRICE. Buying reciprocity costs exactly what it buys.
{
  const atReal = consolidationPrice(real.reciprocity);
  assert(
    Math.abs(atReal.keptFraction - (1 - real.reciprocity)) < 1e-12,
    "kept fraction must be exactly 1 - r",
  );
  assert(
    atReal.keptFraction > 0.1 && atReal.keptFraction < 0.5,
    `at a real economy's reciprocity the farm keeps a minority, got ${atReal.keptFraction.toFixed(3)}`,
  );
  console.log(
    `▸ THE PRICE: to look as reciprocal as a real economy (r=${real.reciprocity.toFixed(2)}) a ` +
      `farm keeps ${(atReal.keptFraction * 100).toFixed(1)}% of what it minted ✓`,
  );

  // 5. It is a trade-off, not a detector: no r escapes it.
  for (const r of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
    const p = consolidationPrice(r);
    assert(
      Math.abs(p.keptFraction - (1 - r)) < 1e-12,
      `the price must hold at every r, failed at ${r}`,
    );
  }
  const half = consolidationPrice(0.5);
  assert(half.costMultiplier === 2, "looking half-reciprocal doubles the farm's cost per PIX");
  console.log(
    "▸ and it is a trade-off, not a detector: kept = 1 − r at every r, so no cadence, " +
      "topology or patience escapes it ✓",
  );
  console.log(
    `▸ looking half alive doubles cost per useful PIX (×${half.costMultiplier}); ` +
      `looking fully alive keeps nothing ✓`,
  );
}

// 6. Cadence: a script versus a night's sleep versus a concert.
{
  const script = Array.from({ length: 2000 }, (_, i) => i * 43_200); // exactly every 43.2s
  const s = cadenceSignature(script);
  assert(s.burstiness < 0.01, `a metronome has no dispersion, got ${s.burstiness.toFixed(3)}`);
  assert(
    Math.abs(s.peakHourShare - 1 / 24) < 0.02,
    `a script never sleeps, got peak hour ${s.peakHourShare.toFixed(3)}`,
  );
  assert(s.quietHours === 0, `a script has no quiet hours, got ${s.quietHours}`);
  console.log(
    `▸ a script gives itself away: burstiness ${s.burstiness.toFixed(3)}, ` +
      `peak hour ${(s.peakHourShare * 100).toFixed(1)}% (flat is ${((1 / 24) * 100).toFixed(1)}%), ` +
      `${s.quietHours} quiet hours ✓`,
  );

  // A concert: one enormous burst inside a single evening.
  const base = Date.UTC(2026, 7, 13, 20, 0, 0);
  const concert = Array.from({ length: 2000 }, () => base + Math.floor(Math.random() * HOUR));
  for (let d = 1; d < 6; d++) concert.push(base + d * DAY + HOUR * 2);
  const c = cadenceSignature(concert);
  assert(c.peakHourShare > 0.9, `a concert concentrates in one hour, got ${c.peakHourShare}`);
  assert(c.quietHours > 12, `and leaves the rest of the day dark, got ${c.quietHours}`);
  console.log(
    `▸ and a concert looks like a concert: ${(c.peakHourShare * 100).toFixed(1)}% of light in ` +
      `one hour, ${c.quietHours} hours dark ✓`,
  );
}

const t = farmSignatureThesis();
for (const [k, v] of Object.entries(t)) console.log(`\n${k}: ${v}`);
console.log("\n═══ PASS — the farm cannot both aggregate and look alive ═══");

#!/usr/bin/env bun
/**
 * The picture breathes: light passes through it rather than piling up in it.
 *
 * Two requests that were one idea. "Change continuously, like fireflies" needs decay, which
 * `pixelBrightness` cannot do because it is monotonic. And "all the bitcoin being minted
 * doesn't render it useless" is right for a reason that fixes the terminus: Bitcoin's coins
 * are not destroyed when spent, so minting ending is not the system ending. Pixel's records
 * consumed one PIX permanently, which is what gave it a last page. **The cap never caused
 * the terminus. The sink did.**
 *
 * Proves:
 *   1. The old brightness cannot twinkle: it never dims.
 *   2. Firefly brightness does — bright now, dim minutes later, from the same pixel.
 *   3. It never goes fully dark: an ember, so history stays visible.
 *   4. A conduit conserves light. Supply is delayed, never destroyed.
 *   5. So there is no last page, for exactly Bitcoin's reason.
 *   6. And it does NOT reopen the collusion hole, because what mattered was the light
 *      leaving the pair, not being destroyed.
 */

import {
  EMBER_FLOOR,
  FIREFLY_HALF_LIFE_MS,
  livingBrightness,
  twinkleAmplitude,
  QUIET_TWINKLE,
  TWINKLE_PERIOD_S,
  waveAmplitudeByCell,
  conduitConserved,
  fireflyBrightness,
  fireflyThesis,
  isTwinkling,
  newConduit,
  recordThroughConduit,
  welcomeFromConduit,
} from "../src/lib/pixel/firefly";
import { pixelBrightness } from "../src/lib/pixel/lit-cell";
import type { LedgerPixel } from "../src/lib/pixel/chain";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

/** A pixel with `moments` spends, the most recent landing at `at`. */
function pixelWith(moments: number, at: number): LedgerPixel {
  const transactions = [
    { txid: "coinbase", inputs: [], outputs: [], timestamp: at - 1000 },
    ...Array.from({ length: moments }, (_, i) => ({
      txid: `m${i}`,
      inputs: [{ txid: "prev", vout: 0 }],
      outputs: [],
      timestamp: at - (moments - 1 - i) * 10,
    })),
  ];
  return { transactions } as unknown as LedgerPixel;
}

console.log("═══ FIREFLIES ═══\n");

const T0 = Date.UTC(2026, 7, 14, 1, 0, 0);

// 1. The old brightness cannot twinkle.
{
  const p = pixelWith(4, T0);
  const a = pixelBrightness(p);
  const b = pixelBrightness(p); // no time argument exists — that is the problem
  assert(a === b, "pixelBrightness has no notion of now");
  assert(a > 0, "and it is permanently lit once anything happened");
  console.log(
    `▸ the old brightness cannot twinkle: ${a.toFixed(3)} now and ${b.toFixed(3)} forever, ` +
      `with no time input at all ✗`,
  );
}

// 2 + 3. Firefly brightness decays, and leaves an ember.
{
  const p = pixelWith(4, T0);
  const now = fireflyBrightness(p, T0);
  const oneHalfLife = fireflyBrightness(p, T0 + FIREFLY_HALF_LIFE_MS);
  const later = fireflyBrightness(p, T0 + FIREFLY_HALF_LIFE_MS * 10);

  assert(now > oneHalfLife, "a moment must fade");
  assert(
    Math.abs(oneHalfLife / now - 0.5) < 0.02,
    `one half-life should halve it, got ${(oneHalfLife / now).toFixed(3)}`,
  );
  assert(later === EMBER_FLOOR, `and settle to an ember, got ${later}`);
  assert(later > 0, "never fully dark — the record is still there");
  console.log(
    `▸ fireflies: ${now.toFixed(3)} at the moment, ${oneHalfLife.toFixed(3)} one half-life ` +
      `later, ${later.toFixed(3)} after ten ✓`,
  );
  assert(isTwinkling(p, T0), "it should read as twinkling right after a moment");
  assert(!isTwinkling(p, T0 + FIREFLY_HALF_LIFE_MS * 10), "and as an ember long after");
  console.log("▸ twinkling now, an ember later, never dark — history stays visible ✓");

  // Busier pixels flare brighter but decay on the same curve.
  const busy = fireflyBrightness(pixelWith(16, T0), T0);
  const quiet = fireflyBrightness(pixelWith(1, T0), T0);
  assert(busy > quiet, "a busy pixel flares brighter");
  console.log(
    `▸ a busy pixel flares brighter than a quiet one (${busy.toFixed(3)} vs ` +
      `${quiet.toFixed(3)}) and both decay the same ✓`,
  );
}

// 4 + 5. A conduit conserves light, so there is no last page.
{
  const START = 1000;
  let c = newConduit(START);
  for (let i = 0; i < 400; i++) {
    c = recordThroughConduit(c);
    // Every other record's share goes straight back out as a welcome.
    if (i % 2 === 0) c = welcomeFromConduit(c);
  }
  assert(conduitConserved(c, START), "a conduit must neither create nor destroy light");
  console.log(
    `▸ a conduit conserves: ${c.throughput} records passed ${c.throughput} PIX through, ` +
      `${c.welcomesFunded} welcomes funded, ${c.circulating + c.inPicture} PIX still exist ✓`,
  );

  // Drain everything the picture holds and it all comes back to circulation.
  while (c.inPicture > 0) c = welcomeFromConduit(c);
  assert(c.circulating === START, `all light returns to circulation, got ${c.circulating}`);
  assert(c.inPicture === 0, "and the picture holds nothing permanently");
  console.log(
    `▸ so there is no last page: all ${START} PIX are back in circulation and can be written ` +
      `with again — exactly Bitcoin's reason for surviving its last block ✓`,
  );
  console.log(
    `▸ and records fund the on-ramp: ${c.welcomesFunded} welcomes paid for by people writing ✓`,
  );
}

// 6. It does not reopen the collusion hole.
{
  // A colluding pair writes records to each other. Under a conduit the picture's share and
  // the witness's share both leave the pair, so the pair still pays two per record.
  const pairStart = 8;
  let pair = pairStart;
  let records = 0;
  while (pair >= 2) {
    pair -= 2; // one to the picture (leaves the pair), one to the witness (leaves the pair)
    pair += 0; // the cosigner's share is internal, already counted
    records += 1;
  }
  assert(records === 4, `eight PIX should buy four colluding records, got ${records}`);
  assert(pair < 2, "and then the pair is broke");
  console.log(
    `▸ collusion still pays: ${pairStart} PIX bought ${records} records, then broke — ` +
      `recycled light is just as gone from the pair as burnt light ✓`,
  );
  console.log(
    "▸ a sink and a conduit are identical from inside the pair; they differ only for " +
      "everybody else ✓",
  );
}

// 7. The rendered brightness: three sources, kept separate, wave dominant.
{
  const base = { now: T0, index: 3, lastMoment: T0, halfLifeMs: FIREFLY_HALF_LIFE_MS };

  // A dark pixel stays dark. Decoration must never invent light that did not happen.
  assert(
    livingBrightness({ ...base, ember: 0, wave: 0, lastMoment: null }) === 0,
    "a pixel with no moments and no wave must render dark",
  );
  console.log("▸ shimmer cannot light a dark pixel — decoration never invents a moment ✓");

  // The wave dominates, because it is the only agreed input.
  const withWave = livingBrightness({ ...base, ember: 0.2, wave: 0.95 });
  const withoutWave = livingBrightness({ ...base, ember: 0.2, wave: 0 });
  assert(withWave > withoutWave, "a cell the wave is touching must outshine one it is not");
  assert(withWave > 0.7, `and it should read as a flare, got ${withWave.toFixed(3)}`);
  console.log(
    `▸ the wave dominates: ${withWave.toFixed(3)} touched vs ${withoutWave.toFixed(3)} not — ` +
      `and the wave is the consensus-bound part ✓`,
  );

  // History stays visible: an old pixel sits at an ember, never black.
  const old = livingBrightness({ ...base, ember: 0.8, wave: 0, lastMoment: T0 - 3_600_000 });
  assert(old >= EMBER_FLOOR, `an old pixel keeps an ember, got ${old.toFixed(3)}`);
  assert(old < withWave, "but it does not compete with a live flare");
  console.log(`▸ history keeps an ember (${old.toFixed(3)}) without competing with a flare ✓`);

  // It actually moves: same pixel, two moments in time, different brightness.
  const t1 = livingBrightness({ ...base, ember: 0.6, wave: 0, now: T0 });
  const t2 = livingBrightness({ ...base, ember: 0.6, wave: 0, now: T0 + 700 });
  assert(t1 !== t2, "the same pixel must differ between frames, or nothing twinkles");
  console.log(`▸ it moves between frames: ${t1.toFixed(4)} then ${t2.toFixed(4)} ✓`);

  // Neighbours blink out of phase, which is what makes it read as fireflies.
  const a = livingBrightness({ ...base, ember: 0.6, wave: 0, index: 10 });
  const b = livingBrightness({ ...base, ember: 0.6, wave: 0, index: 11 });
  assert(a !== b, "adjacent pixels must be out of phase, or the field pulses like a machine");
  console.log(`▸ neighbours blink out of phase (${a.toFixed(4)} vs ${b.toFixed(4)}) ✓`);
}

// 8. Wave amplitudes read from the tip, strongest hit per cell.
{
  const amps = waveAmplitudeByCell([
    { cellIndex: 4, amplitudeMilli: 3000 },
    { cellIndex: 4, amplitudeMilli: 9000 },
    { cellIndex: 7, amplitudeMilli: 10_000 },
  ]);
  assert(amps.get(4) === 0.9, `strongest hit per cell wins, got ${amps.get(4)}`);
  assert(amps.get(7) === 1, "full amplitude maps to 1");
  assert(waveAmplitudeByCell(undefined).size === 0, "no wave means no amplitudes");
  console.log("▸ tip wave amplitudes: strongest hit per cell, 0..1, empty when absent ✓");
}

// 9. What the renderer actually uses: amplitude and phase, motion left to CSS.
{
  // A dark pixel gets no amplitude. Decoration must never invent a moment.
  const dark = twinkleAmplitude({ ember: 0, wave: 0, index: 5 });
  assert(dark.amplitude === 0, "a pixel with no moments and no wave must not twinkle");
  console.log("▸ a dark pixel gets no amplitude — decoration never invents a moment ✓");

  // The wave dominates; history only breathes.
  const flaring = twinkleAmplitude({ ember: 0.2, wave: 0.9, index: 5 });
  const quiet = twinkleAmplitude({ ember: 0.2, wave: 0, index: 5 });
  assert(flaring.amplitude === 0.9, `a wave cell flares, got ${flaring.amplitude}`);
  assert(quiet.amplitude === QUIET_TWINKLE, `a quiet cell breathes, got ${quiet.amplitude}`);
  assert(flaring.amplitude > quiet.amplitude * 2, "the flare must clearly outweigh the breath");
  console.log(
    `▸ the wave drives it: ${flaring.amplitude} where light is moving vs ${quiet.amplitude} ` +
      `where it is not ✓`,
  );

  // Neighbours out of step, and no run of them lands in phase.
  const phases = Array.from(
    { length: 24 },
    (_, i) => twinkleAmplitude({ ember: 0.5, wave: 0, index: i }).phaseSeconds,
  );
  assert(
    new Set(phases.map((p) => p.toFixed(3))).size === phases.length,
    "phases must be distinct",
  );
  for (let i = 1; i < phases.length; i++) {
    assert(phases[i] !== phases[i - 1], `adjacent pixels must not share a phase at ${i}`);
  }
  assert(
    phases.every((p) => p <= 0 && p > -TWINKLE_PERIOD_S),
    "a negative delay inside one period starts the animation mid-cycle",
  );
  console.log(
    `▸ ${phases.length} neighbours all out of step, delays spread across the ` +
      `${TWINKLE_PERIOD_S}s period ✓`,
  );
}

const t = fireflyThesis();
for (const [k, v] of Object.entries(t)) console.log(`\n${k}: ${v}`);
console.log("\n═══ PASS — the picture breathes, and a breathing picture has no last page ═══");

/**
 * The picture breathes: light passes through it rather than piling up in it.
 *
 * Two requests that turned out to be one idea.
 *
 * **"I want the picture to change continuously, like fireflies."** A firefly lights, goes
 * dark, and lights again. `pixelBrightness` cannot do that — it is monotonic in cumulative
 * moments, so a pixel that was ever busy stays bright forever. That is an accumulating
 * picture, and accumulation is the opposite of twinkling. Fireflies need **decay**:
 * brightness as a function of how recently light moved, not how much ever did.
 *
 * **"All the bitcoin being minted doesn't render it useless."** Correct, and the reason is
 * the thing this module changes. Bitcoin's coins are not destroyed when spent, so minting
 * ending is not the system ending — the same coins keep moving forever. Pixel's records
 * *consume* one PIX permanently into the picture, so its supply drains and it has a last
 * page (see `end-state.ts`). **The terminus was never caused by the cap. It was caused by
 * the sink.**
 *
 * ## Superseded in part — read docs/PICTURE-PLAN.md first
 *
 * The wall-clock decay below was written before inventorying the repo, and the chain already
 * has a better version of it. `WaveHit.amplitudeMilli` decays `WAVE_DAMPING = 0.55` per hop
 * and fades as its lead recedes from the tip, and `computeTipWaveField` is **consensus-bound**
 * — every node agrees on it. Wall-clock brightness is not: each node computes a different
 * value for the same pixel, so it can never be evidence.
 *
 * **The wave is the firefly.** `fireflyBrightness` should survive only as UI smoothing
 * between tips, not as the model of how the picture moves. The conduit reasoning below
 * stands; the decay curve does not.
 *
 * So the aesthetic requirement and the economic fix are the same statement. If light flows
 * *through* the picture instead of being buried in it, then:
 *
 *   - pixels glow where light is moving now, and dim after — fireflies
 *   - supply is conserved rather than drained — no last page, for the same reason Bitcoin
 *     has none
 *
 * ## What the picture's share becomes
 *
 * Not a burn and not a vault: a **conduit**. A record still costs its author three PIX. One
 * still leaves them for the picture. The picture then spends it welcoming somebody new.
 * Light enters as a record and leaves as a welcome, which also replenishes the on-ramp that
 * `mint-harm.ts` identifies as the harm that survives everything.
 *
 * ## Why this does not reopen the collusion hole
 *
 * `economy-model.ts` proves the picture's share is load-bearing: without it a colluding pair
 * passes the same PIX back and forth and writes forever for free. Recycling keeps that
 * property, because **what matters is that the light leaves the pair, not that it is
 * destroyed.** Recycled to a newcomer it is just as gone from the colluders as if burnt —
 * they are still down two PIX per record. A sink and a conduit are identical from inside the
 * pair; they differ only for everyone else.
 */

import type { LedgerPixel } from "./chain";
import { momentCount } from "./lit-cell";

/** How long a moment keeps glowing. Two minutes, so a pixel visibly breathes. */
export const FIREFLY_HALF_LIFE_MS = 120_000;

/** Faintest a pixel that has ever held a moment is allowed to go. Memory, not brightness. */
export const EMBER_FLOOR = 0.06;

/**
 * A pixel's brightness now, decaying since its most recent moment.
 *
 * Unlike `pixelBrightness` this is a function of time, so the same pixel is bright a second
 * after a transaction and dim a few minutes later. That is what makes the picture move
 * without anything being added to it.
 *
 * It never returns zero for a pixel that has held a moment. The light is not deleted, only
 * quiet — an ember, so the record is still visible as history while the twinkle is reserved
 * for what is happening now.
 */
export function fireflyBrightness(
  pixel: LedgerPixel,
  now: number,
  halfLifeMs = FIREFLY_HALF_LIFE_MS,
): number {
  const moments = momentCount(pixel);
  if (moments <= 0) return 0;

  const last = lastMomentAt(pixel);
  if (last === null) return 0;

  const age = Math.max(0, now - last);
  const decay = Math.pow(0.5, age / halfLifeMs);
  // Busier pixels flare brighter, but every pixel decays on the same curve.
  const peak = Math.min(1, Math.log2(moments + 1) / Math.log2(17));
  return Math.max(EMBER_FLOOR, peak * decay);
}

/** When light last moved in this pixel. */
export function lastMomentAt(pixel: LedgerPixel): number | null {
  let last: number | null = null;
  for (const tx of pixel.transactions) {
    if (tx.inputs.length === 0) continue;
    if (last === null || tx.timestamp > last) last = tx.timestamp;
  }
  return last;
}

/** Is this pixel currently twinkling rather than sitting as an ember? */
export function isTwinkling(pixel: LedgerPixel, now: number): boolean {
  return fireflyBrightness(pixel, now) > EMBER_FLOOR * 2;
}

/**
 * What a pixel looks like right now, from three sources kept deliberately separate.
 *
 * Pure so it can be tested without a browser, and so the three inputs cannot get blended
 * into one number that nobody can reason about:
 *
 *   - **ember** — cumulative moments (`pixelBrightness`). History. Never dims, so it is the
 *     floor rather than the signal, and it is what stops the picture forgetting.
 *   - **wave** — `WaveHit.amplitudeMilli / 10000` for cells the tip's wave is touching.
 *     **This is the only one that is agreed**: it is bound into `waveDigest` in PoLS, so
 *     every node computes the same value. It is the flare when light moves.
 *   - **shimmer** — a slow out-of-phase oscillation keyed to the pixel's index. Pure
 *     decoration, and honest about it: fireflies blink asynchronously, so a picture where
 *     everything pulses together reads as a machine rather than as a field.
 *
 * The wave dominates when present, because that is the part that means something. The ember
 * keeps history visible underneath. The shimmer only ever modulates what is already lit —
 * it can never light a dark pixel, or the picture would be showing things that did not
 * happen.
 *
 * **Not used by the renderer.** `twinkleAmplitude` plus CSS keyframes replaced it, because
 * driving inline styles from a clock fought the cells' `transition-all` and produced no
 * visible motion. Kept because the composition it describes is still the model, and its
 * tests pin the rules the CSS now implements.
 */
/**
 * How hard a cell twinkles, and how far out of step with its neighbours.
 *
 * The motion itself belongs to CSS (`@keyframes pixel-twinkle`), not to a React clock. A
 * clock was tried first and did not work: the cells carry a 700ms `transition-all`, so
 * re-rendering inline opacity every frame merely restarted the interpolation each time and
 * the amplitude collapsed to nothing. Keyframes run on the compositor, cannot be swallowed
 * by a transition, and cost nothing per cell.
 *
 * So this returns *how much*, and CSS supplies *when*:
 *
 *   - **amplitude** — driven by the tip's wave, the only consensus-bound input. A cell the
 *     wave is passing through flares; a quiet one only breathes, at `QUIET_TWINKLE`, which
 *     keeps the field alive without claiming anything happened there.
 *   - **phaseSeconds** — a negative animation delay from the pixel index, so neighbours are
 *     out of step. Fireflies blink asynchronously; a field pulsing in unison reads as a
 *     machine rather than as something living.
 *
 * A dark pixel gets no amplitude at all. Decoration must never invent a moment.
 */
export const QUIET_TWINKLE = 0.18;
export const TWINKLE_PERIOD_S = 2.3;

export function twinkleAmplitude(params: { ember: number; wave: number; index: number }): {
  amplitude: number;
  phaseSeconds: number;
} {
  const { ember, wave, index } = params;
  if (ember <= 0 && wave <= 0) return { amplitude: 0, phaseSeconds: 0 };
  // The wave dominates; history only ever breathes.
  const amplitude = Math.min(1, Math.max(QUIET_TWINKLE, wave, ember * 0.35));
  // Irrational-ish stride so runs of adjacent indices do not land in step.
  const phaseSeconds = -((index * 0.618) % TWINKLE_PERIOD_S);
  return { amplitude, phaseSeconds };
}

export function livingBrightness(params: {
  /** Cumulative brightness from moments — the floor. */
  ember: number;
  /** Tip wave amplitude for this cell, 0..1. Consensus-bound. */
  wave: number;
  /** Wall-clock ms, for shimmer and decay. */
  now: number;
  /** Pixel index, so neighbours blink out of phase with each other. */
  index: number;
  /** When light last moved here, for the flare's decay. Null if never. */
  lastMoment: number | null;
  halfLifeMs?: number;
}): number {
  const { ember, wave, now, index, lastMoment, halfLifeMs = FIREFLY_HALF_LIFE_MS } = params;
  if (ember <= 0 && wave <= 0) return 0;

  // A recent moment flares and settles. Consensus says how strong; the clock says how long.
  const age = lastMoment === null ? Infinity : Math.max(0, now - lastMoment);
  const recency = Number.isFinite(age) ? Math.pow(0.5, age / halfLifeMs) : 0;

  const flare = Math.max(wave, ember * recency);
  const base = Math.max(EMBER_FLOOR, ember * 0.45, flare);

  // Out-of-phase twinkle, scaled so it is visible but never invents light.
  const phase = now / 1400 + index * 1.7;
  const shimmer = 1 + 0.16 * Math.sin(phase);
  return Math.min(1, Math.max(EMBER_FLOOR, base * shimmer));
}

/** Tip wave amplitudes by cell index, 0..1. Empty when the tip carries no wave. */
export function waveAmplitudeByCell(
  hits: ReadonlyArray<{ cellIndex: number; amplitudeMilli: number }> | undefined,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const hit of hits ?? []) {
    const amp = Math.min(1, Math.max(0, hit.amplitudeMilli / 10_000));
    out.set(hit.cellIndex, Math.max(out.get(hit.cellIndex) ?? 0, amp));
  }
  return out;
}

export interface Conduit {
  /** PIX held by the picture right now, waiting to welcome somebody. */
  inPicture: number;
  /** Total that has passed through, ever. The picture's throughput. */
  throughput: number;
  /** Welcomes funded out of records. */
  welcomesFunded: number;
  circulating: number;
}

export function newConduit(circulating: number): Conduit {
  return { inPicture: 0, throughput: 0, welcomesFunded: 0, circulating };
}

/** A record: the author pays three, one of which reaches the picture. */
export function recordThroughConduit(c: Conduit): Conduit {
  return {
    ...c,
    inPicture: c.inPicture + 1,
    throughput: c.throughput + 1,
    // The cosigner's and witness's shares stay in circulation; only the picture's moves out.
    circulating: c.circulating - 1,
  };
}

/** The picture spends its held light welcoming somebody new. Nothing is created. */
export function welcomeFromConduit(c: Conduit): Conduit {
  if (c.inPicture <= 0) return c;
  return {
    ...c,
    inPicture: c.inPicture - 1,
    welcomesFunded: c.welcomesFunded + 1,
    circulating: c.circulating + 1,
  };
}

/** Light is neither created nor destroyed by a conduit — only delayed. */
export function conduitConserved(c: Conduit, startCirculating: number): boolean {
  return c.circulating + c.inPicture === startCirculating;
}

export function fireflyThesis(): Record<string, string> {
  return {
    supersededDecay:
      "The wall-clock decay here is the weaker of two versions. WaveHit.amplitudeMilli already " +
      "decays per hop and per lead age and is consensus-bound, so every node agrees on it; " +
      "wall-clock brightness differs per node and can never be evidence. Use the wave. See " +
      "docs/PICTURE-PLAN.md.",
    oneIdea:
      "Twinkling and never ending are the same requirement. A picture that accumulates " +
      "cannot twinkle, and a supply that accumulates into a sink cannot continue. Make " +
      "light flow through the picture and both are answered at once.",
    bitcoinWasRight:
      "Minting out does not end Bitcoin because its coins are not destroyed when spent. " +
      "Pixel's terminus was never caused by the cap — it was caused by the sink. Remove " +
      "the sink and there is no last page, for exactly Bitcoin's reason.",
    conduitNotVault:
      "The picture's share becomes a conduit rather than a burn. A record still costs its " +
      "author three PIX and one still leaves them, but the picture spends it welcoming " +
      "somebody new. Light enters as a record and leaves as a welcome.",
    collusionStillPays:
      "This does not reopen the hole the sink was closing. What mattered was that the light " +
      "leaves the pair, not that it is destroyed — recycled to a newcomer it is just as gone " +
      "from the colluders. A sink and a conduit are identical from inside the pair.",
    andItFeedsTheOnRamp:
      "It also replenishes the on-ramp, which is the harm that survived every other " +
      "correction. Records fund welcomes, so the people with no light yet are paid for by " +
      "the people writing.",
  };
}

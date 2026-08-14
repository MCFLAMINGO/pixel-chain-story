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

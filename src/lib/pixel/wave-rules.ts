/**
 * Wave lab rules — named damping + energy-cost accounting (SPATIAL S4).
 *
 * WAVE_DAMPING is consensus-critical: amplitudes already enter waveDigest (wave|v1).
 * Changing it changes digests. Energy-cost helpers are labeled lab models — not
 * Energy Truth Joules, not metered physics, not PIX gas.
 */

import type { WaveHit } from "./wave";

/** Per-hop amplitude multiplier in outgoingWaveHits (consensus-critical). */
export const WAVE_DAMPING = 0.55;

/** Label for lab docs / RPC — bump when rules set changes intentionally. */
export const WAVE_RULES_LABEL = "wave-rules-v1";

/**
 * Lab energy cost from wave hits (milli-units).
 * Model: sum over hits of amplitudeMilli * (hop + 1) — labeled, not metered.
 */
export function waveEnergyCostMilli(hits: readonly WaveHit[]): number {
  let sum = 0;
  for (const h of hits) {
    sum += h.amplitudeMilli * (h.hop + 1);
  }
  return sum;
}

export function waveRulesThesis(): string {
  return (
    `Wave rules (${WAVE_RULES_LABEL}): damping=${WAVE_DAMPING} is a named consensus-critical ` +
    "constant already inside amplitudeMilli → waveDigest. Energy-cost milli is a labeled lab " +
    "model for accounting — not Energy Truth Joules, not PIX gas, not a meter."
  );
}

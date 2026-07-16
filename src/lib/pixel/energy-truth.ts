/**
 * Energy Truth — why this ledger exists.
 *
 * Not a green sticker on a renamed chain. Every illuminated pixel should be
 * accountable for what it cost *and* what waste it refused.
 *
 * Numbers here are **models** (labeled), not pretend meters. When real meters
 * exist, swap the model — never claim measurement you did not take.
 */

export interface EnergyTruth {
  /** Estimated electrical energy for one PoLS illuminate (Joules). */
  polsJoules: number;
  /** Order-of-magnitude PoW energy for one comparable settlement (Joules). */
  powComparableJoules: number;
  /** Model water avoided vs energy-intensive cooling culture (liters). */
  waterLitersAvoided: number;
  /** How many times cheaper PoLS is vs the PoW comparable (ratio). */
  savingsRatio: number;
  model: string;
  honesty: "estimate-model-not-meter";
  purpose: string;
}

/**
 * Conservative order-of-magnitude models (2020s public discourse ranges).
 * PoW "per settlement" figures are famously noisy; we use a mid illustrative
 * kWh and convert — always labeled as model.
 */
const POW_KWH_PER_SETTLEMENT_MODEL = 700; // illustrative; not a promise
const POLS_JOULES_PER_ILLUMINATE_MODEL = 5; // sign + verify + gossip on commodity hardware
const WATER_LITERS_PER_KWH_COOLING_MODEL = 1.8; // evaporative / data-center order model

export function energyTruthForIlluminate(txCount = 1): EnergyTruth {
  const polsJoules = POLS_JOULES_PER_ILLUMINATE_MODEL * Math.max(1, txCount);
  const powComparableJoules = POW_KWH_PER_SETTLEMENT_MODEL * 3.6e6 * Math.max(1, txCount);
  const waterLitersAvoided =
    POW_KWH_PER_SETTLEMENT_MODEL * WATER_LITERS_PER_KWH_COOLING_MODEL * Math.max(1, txCount);
  return {
    polsJoules,
    powComparableJoules,
    waterLitersAvoided,
    savingsRatio: powComparableJoules / polsJoules,
    model: "pixel-energy-truth-v1",
    honesty: "estimate-model-not-meter",
    purpose:
      "Rebuke hyperscale energy/water appetite. Settlement is light + hash — not warehouses of GPUs drinking rivers.",
  };
}

/** One-line challenge to datacenter-scale waste culture. */
export function datacenterRebuke(t: EnergyTruth = energyTruthForIlluminate(1)): string {
  return (
    `One pixel illuminate ≈ ${t.polsJoules} J of PoLS work — not a rack, not a cooling lake. ` +
    `Model savings vs PoW settlement culture: ${Math.round(t.savingsRatio).toLocaleString()}× energy, ` +
    `~${Math.round(t.waterLitersAvoided)} L water not demanded. [${t.honesty}]`
  );
}

export function formatEnergyTruth(t: EnergyTruth): string {
  const save =
    t.savingsRatio >= 1e6
      ? `${(t.savingsRatio / 1e6).toFixed(1)}M×`
      : `${Math.round(t.savingsRatio).toLocaleString()}×`;
  return (
    `PoLS ~${t.polsJoules} J vs PoW-model ~${(t.powComparableJoules / 3.6e6).toFixed(0)} kWh` +
    ` (${save} less). Water-model avoided ~${Math.round(t.waterLitersAvoided)} L. [${t.honesty}]`
  );
}

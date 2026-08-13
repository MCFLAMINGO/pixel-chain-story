/**
 * Arithmetic for a supply pegged to human presence — see docs/EMISSION.md.
 *
 * This is a model, not a mechanism. Nothing here touches consensus, emission or
 * the tip. It exists so the numbers in the emission discussion are computed in
 * one place and checked by `bun run test:presence-peg`, rather than being prose
 * that nobody can audit.
 *
 * The demographic inputs are third-party estimates and MUST NOT become consensus
 * values. A design that has to read the census needs an oracle, which defeats
 * the purpose; the reason `steadySupply` matters is that decay plus renewal
 * reproduces a census peg without ever consulting one.
 */

/** UN-derived estimates, ~2026. Inputs to a discussion, not protocol constants. */
export const WORLD_POPULATION = 8.2e9;
export const WORLD_PEAK_POPULATION = 10.3e9;
export const WORLD_PEAK_YEAR = 2084;
export const WORLD_LIFE_EXPECTANCY = 73;
export const WORLD_BIRTHS_PER_YEAR = 1.32e8;
export const WORLD_DEATHS_PER_YEAR = 6.2e7;

export interface SteadySupplyParams {
  /** How long light lasts without renewal. */
  halfLifeYears: number;
  /** The 24-hour fact, as a cap: renewals one identity may earn per day. */
  renewalsPerPersonPerDay: number;
  /** Defaults to the world population. */
  population?: number;
}

export interface PresencePegModel {
  population: number;
  peakPopulation: number;
  peakYear: number;
  lifeExpectancy: number;
  birthsPerYear: number;
  deathsPerYear: number;
  /** Everyone alive lives one year per year, so this *is* the population. */
  personYearsPerYear: number;
  personHoursPerDay: number;
  birthRate: number;
  deathRate: number;
  netIssuance: number;
  /**
   * Standing supply when light decays unless renewed:
   *
   *   supply = people × renewals/person/day × half-life(days) / ln 2
   *
   * Proportional to the number of people who keep showing up, which is how a
   * census peg is reached without reading the census.
   */
  steadySupply(params: SteadySupplyParams): number;
  /** Renewal rate that makes the standing supply one unit per living person. */
  renewalRateForOnePerPerson(halfLifeYears: number, population?: number): number;
  netIssuanceAt(params: { birthsPerYear: number; deathsPerYear: number }): number;
}

export function presencePegModel(population = WORLD_POPULATION): PresencePegModel {
  const days = (years: number) => years * 365;
  return {
    population,
    peakPopulation: WORLD_PEAK_POPULATION,
    peakYear: WORLD_PEAK_YEAR,
    lifeExpectancy: WORLD_LIFE_EXPECTANCY,
    birthsPerYear: WORLD_BIRTHS_PER_YEAR,
    deathsPerYear: WORLD_DEATHS_PER_YEAR,
    personYearsPerYear: population,
    personHoursPerDay: population * 24,
    birthRate: WORLD_BIRTHS_PER_YEAR / population,
    deathRate: WORLD_DEATHS_PER_YEAR / population,
    netIssuance: (WORLD_BIRTHS_PER_YEAR - WORLD_DEATHS_PER_YEAR) / population,
    steadySupply({ halfLifeYears, renewalsPerPersonPerDay, population: p = population }) {
      return (p * renewalsPerPersonPerDay * days(halfLifeYears)) / Math.LN2;
    },
    renewalRateForOnePerPerson(halfLifeYears) {
      return Math.LN2 / days(halfLifeYears);
    },
    netIssuanceAt({ birthsPerYear, deathsPerYear }) {
      return (birthsPerYear - deathsPerYear) / population;
    },
  };
}

/**
 * The three supply regimes available, and why you cannot have all of them.
 *
 * A supply either converges to a fixed number, tracks the living population, or
 * accumulates forever. Each is reachable; no design reaches two at once, because
 * the second requires the stock to shrink when people leave and the third
 * requires it not to.
 */
export type SupplyRegime = "fixed-cap" | "population-pegged" | "cumulative";

export interface DecayDial {
  halfLifeYears: number;
  /** Fraction of an untouched balance lost per year. */
  annualDecay: number;
  /** What an honest person loses by being absent this long. */
  absencePenalty(months: number): number;
  /**
   * Fraction of holdings a farm must re-earn each year merely to stand still.
   * Equal to `annualDecay` — decay cannot tell absence from fakery, so the
   * forgiveness of one sets the cost of the other. This is the whole tradeoff.
   */
  sybilCarryPerYear: number;
}

export function decayDial(halfLifeYears: number): DecayDial {
  const halfLifeDays = halfLifeYears * 365;
  const annualDecay = 1 - Math.pow(2, -365 / halfLifeDays);
  return {
    halfLifeYears,
    annualDecay,
    absencePenalty: (months) => 1 - Math.pow(2, (-months * 365) / 12 / halfLifeDays),
    sybilCarryPerYear: annualDecay,
  };
}

/**
 * Supply when minted light is permanent and only the earning rate lapses.
 *
 * This is cumulative person-time: it rises without bound and never contracts,
 * because deaths remove no already-minted light. It is the right shape for a
 * *record* and the wrong shape for money — it cannot be a population peg.
 */
export function cumulativePresence(params: {
  years: number;
  population?: number;
  renewalsPerPersonPerDay?: number;
}): number {
  const { years, population = WORLD_POPULATION, renewalsPerPersonPerDay = 1 } = params;
  return population * renewalsPerPersonPerDay * 365 * years;
}

export interface SybilEconomics {
  /** Amortized cost of holding one fake identity for a day. */
  costPerIdentityPerDay: number;
  /** Reward value per identity-day at which faking stops paying. */
  breakevenRewardPerIdentityDay: number;
  /** Daily profit of a farm. Negative means farming does not pay. */
  farmProfitPerDay(params: { identities: number; rewardValuePerIdentityDay: number }): number;
}

/**
 * Whether faking presence pays, which decay does not decide.
 *
 * Decay bounds how much a farm can accumulate, but the profitability of the
 * marginal fake is set only by reward against cost. If one fake presence earns
 * more than it costs, farming pays at any half-life.
 *
 * The per-identity daily cap — the 24-hour fact — is what makes the cost real:
 * without it one device fakes unlimited presences and the cost per presence goes
 * to nothing.
 */
export function sybilEconomics(params: {
  deviceCost: number;
  deviceLifetimeYears: number;
  /** The 24-hour cap. Above 1, one device serves several identities per day. */
  presencesPerDevicePerDay?: number;
}): SybilEconomics {
  const { deviceCost, deviceLifetimeYears, presencesPerDevicePerDay = 1 } = params;
  const perDay = deviceCost / (deviceLifetimeYears * 365);
  const costPerIdentityPerDay = perDay / presencesPerDevicePerDay;
  return {
    costPerIdentityPerDay,
    breakevenRewardPerIdentityDay: costPerIdentityPerDay,
    farmProfitPerDay: ({ identities, rewardValuePerIdentityDay }) =>
      identities * (rewardValuePerIdentityDay - costPerIdentityPerDay),
  };
}

/**
 * What a farm of devices yields, if a gift has to be a physical meeting.
 *
 * "Make giving cost a phone" is the obvious answer to the mint-back's Sybil hole:
 * a fresh address is free, but a fresh address that has physically met another one
 * needs a second handset in a second place. Buying presence should then cost money.
 *
 * It does — but the shape of the cost is what decides whether that helps, and under
 * the current rule the shape favours the attacker.
 *
 * **One gift per ordered pair is a per-pair budget, and pairs grow as K².** A farm of
 * K devices commands K(K−1) ordered pairs while paying for only K devices, so the
 * cost per minted PIX falls as 1/K. Sybil resistance that gets *cheaper* the bigger
 * the attacker is not Sybil resistance; it is a volume discount.
 *
 * **A per-identity budget grows as K.** Cap how many gifts an address may ever give
 * and the yield is K·G against a cost of K devices, so cost per PIX is phone/G — a
 * constant, the same for a farm of ten and a farm of a million. That is the property
 * worth having: not that faking is impossible, but that faking does not get cheaper
 * with scale.
 *
 * Neither is implemented. This is the arithmetic for choosing, checked by
 * `bun run test:presence-peg` so the comparison is not prose.
 */
export interface FarmYield {
  devices: number;
  /** PIX the farm can mint over the devices' lifetime. */
  minted: number;
  capexUsd: number;
  costPerPixUsd: number;
  /** Share of the whole 10.3e9 cap this farm captures. */
  shareOfCap: number;
}

export function farmYield(params: {
  devices: number;
  deviceCostUsd: number;
  /** Per-identity lifetime gift budget. Omit for the per-pair rule (K² pairs). */
  giftsPerIdentity?: number;
}): FarmYield {
  const { devices, deviceCostUsd, giftsPerIdentity } = params;
  const minted =
    giftsPerIdentity === undefined
      ? devices * (devices - 1) // every ordered pair is a fresh pair
      : devices * giftsPerIdentity;
  const capexUsd = devices * deviceCostUsd;
  return {
    devices,
    minted,
    capexUsd,
    costPerPixUsd: minted === 0 ? Infinity : capexUsd / minted,
    shareOfCap: minted / WORLD_PEAK_POPULATION,
  };
}

export function giftBudgetThesis(): {
  perPair: string;
  perIdentity: string;
  electricity: string;
  unresolved: string;
} {
  return {
    perPair:
      "One gift per ordered pair is a per-pair budget, and ordered pairs grow as K² " +
      "against a device cost of K. Cost per PIX falls as 1/K, so a big farm pays less " +
      "per PIX than a small one. A $20M farm of 100,000 handsets commands enough pairs " +
      "to mint the entire supply.",
    perIdentity:
      "A lifetime cap of G gifts per address makes yield K·G against cost K, so cost " +
      "per PIX is phone/G — constant at every scale. Faking stays possible and stops " +
      "getting cheaper, which is the property actually worth buying.",
    electricity:
      "Proof of work per mint does not substitute. Cloud silicon beats handsets on " +
      "cost per hash, so it prices out the phone it was meant to privilege, and " +
      "burning energy to prove presence contradicts the reason this chain exists.",
    unresolved:
      "Both assume presence can be proven at all. It cannot be proven by the two " +
      "parties alone — they can always simulate the channel between them — so a real " +
      "presence proof needs a third party who was there, or hardware attestation and " +
      "the vendor as trust root. kindling.ts labels its seal `simulated` for this reason.",
  };
}

export function splitDesignThesis(): {
  problem: string;
  split: string;
  moments: string;
  pix: string;
  keeps: string;
  stillCosts: string;
} {
  return {
    problem:
      "Decaying the stock tracks the population but taxes absence. Keeping the " +
      "stock permanent forgives absence but abandons the peg. One quantity cannot " +
      "do both.",
    split:
      "Two quantities. The record is not the money, and only Bitcoin's design " +
      "forces them to be the same object.",
    moments:
      "Witnessed presence: cumulative, permanent, non-transferable. Grows forever, " +
      "which is correct for a record and cheap to hold, since an unlit pixel needs " +
      "no power. Getting sick never erases a moment you were present for.",
    pix:
      "The fungible claim: decays, tracks living presence, rations the right to " +
      "write. Absence costs future income, not memory.",
    keeps:
      "Supply still falls when people stop showing up, so 'the light goes out' " +
      "survives, and no oracle is consulted.",
    stillCosts:
      "Absence is still taxed on the money side at exactly the rate that makes " +
      "hoarded fakes expensive to maintain. The dial is shared; only its blast " +
      "radius shrinks.",
  };
}

export function presencePegThesis(): {
  buildable: string;
  notBuildable: string;
  cost: string;
  restsOn: string;
} {
  return {
    buildable:
      "Light that fades unless renewed by presence. Standing supply then tracks the " +
      "people who keep showing up, with no oracle and no hardcoded projection.",
    notBuildable:
      "Reading the census. Population is a third-party estimate, revised " +
      "retroactively; hardcoding a projection is a fixed schedule wearing a lab coat. " +
      "A ledger also cannot observe death — only silence.",
    cost:
      "This is demurrage (Gesell, Wörgl 1932, Freicoin 2013). It encourages " +
      "circulation and punishes patience. A supply tracking living presence cannot " +
      "also be a thing you inherit unchanged.",
    restsOn:
      "Presence being expensive to fake. If issuance is gated on presence then " +
      "manufacturing identities manufactures money, and a Kindling presence seal " +
      "proves two optical captures were combined, not that two humans were there.",
  };
}

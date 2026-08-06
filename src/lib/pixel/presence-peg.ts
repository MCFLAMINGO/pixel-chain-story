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

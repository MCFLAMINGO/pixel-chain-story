/**
 * What a farm actually harms. Less than it first appears, and not what I first wrote.
 *
 * An earlier version of this module claimed the harm was *exclusion*: that cap consumed
 * by a farm was cap unavailable to humans not yet born, and that one farmed PIX was one
 * person who could never be welcomed. **That was wrong, and wrong in a way worth keeping
 * a record of, because it overstated the stakes of the entire Sybil discussion.**
 *
 * A person can always be given light. Whether it is newly minted makes no difference to
 * them. A welcome is somebody giving you light, and there are two routes:
 *
 *   - the giver has an unused mint-back budget, so the light is new and giving is free
 *   - the giver has none left, so the light is theirs already and giving costs them one
 *
 * Either way you are welcomed and hold light. **The cap gates minting, never welcoming.**
 * So an exhausted cap does not lock anyone out; it only ends the subsidy that made giving
 * free. After it, welcoming someone costs the giver one PIX — which is exactly how every
 * gift after the first already works.
 *
 * Two consequences.
 *
 * **The harm of farming is that the subsidy ends sooner.** Not a victim, a convenience:
 * measured in years of free welcoming burnt, not in people excluded. `subsidyHarm`
 * quantifies it.
 *
 * **The fixed cap was never able to subsidise everyone anyway.** At 132 million births a
 * year, a 10.3e9 cap is 78 years of free welcomes, with no farming at all. `PIX_HARD_CAP`
 * equals *peak simultaneous* population, but welcomes accumulate over generations —
 * roughly 117 billion humans have ever lived, about eleven times the cap. So the cap was
 * always a subsidy with a horizon rather than a seat for every person. That is fine once
 * named. It is not fine while being described as one PIX per human forever.
 *
 * The whole thing is milder than the earlier framing, and the design is more robust than
 * that framing implied: the light does not die, wallets emptying destroy nothing, and
 * nobody is ever locked out.
 */

import { PIX_HARD_CAP } from "./economics";
import { WORLD_BIRTHS_PER_YEAR } from "./presence-peg";

/** Years of free welcoming the cap can fund, if nobody farms at all. */
export const SUBSIDY_YEARS = PIX_HARD_CAP / WORLD_BIRTHS_PER_YEAR;

export interface SubsidyHarm {
  minted: number;
  attackerCostUsd: number;
  /** Years of free welcoming the farm burnt. */
  subsidyYearsLost: number;
  /** Share of the whole subsidy consumed. */
  subsidyShare: number;
  /** People who can no longer be welcomed. Always zero: giving does not require minting. */
  peopleExcluded: 0;
  /** What actually degrades. */
  effect: "welcoming costs the giver one PIX sooner";
}

/**
 * What a farm takes, honestly.
 *
 * `peopleExcluded` is zero by construction, and is kept in the shape as a standing
 * correction: the tempting claim is that farming steals someone's place, and it does not.
 */
export function subsidyHarm(params: { minted: number; costPerPixUsd: number }): SubsidyHarm {
  const { minted, costPerPixUsd } = params;
  return {
    minted,
    attackerCostUsd: minted * costPerPixUsd,
    subsidyYearsLost: minted / WORLD_BIRTHS_PER_YEAR,
    subsidyShare: minted / PIX_HARD_CAP,
    peopleExcluded: 0,
    effect: "welcoming costs the giver one PIX sooner",
  };
}

/**
 * What it costs to burn the entire subsidy — cheap enough that this still matters.
 *
 * Correcting the victim claim must not be read as "farming is harmless." Undefended, the
 * whole 78-year on-ramp costs about a hundred million dollars to destroy, which is inside
 * reach of a state or one rich enemy. See `survivingHarms` for what is actually at stake.
 */
export function subsidyBurnPrice(costPerPixUsd: number): {
  totalUsd: number;
  yearsBurnt: number;
} {
  return { totalUsd: PIX_HARD_CAP * costPerPixUsd, yearsBurnt: SUBSIDY_YEARS };
}

/**
 * Share of the right to write that a farm ends up holding.
 *
 * The harm I had missed, and the one that matters most. PIX *is* the right to write to the
 * picture, so whoever holds the most light decides most of what the record says. Nobody is
 * excluded from joining — that claim was wrong — but they can be **drowned out**, and the
 * picture is the entire point of the project.
 *
 * This is capture of the record, which is the thing the design exists to prevent, so it is
 * a worse outcome than the exclusion I originally imagined rather than a milder one.
 */
export function writeShare(params: { farmMinted: number; honestMinted: number }): {
  farmShare: number;
  honestShare: number;
  /** How many honest welcomes are needed to dilute the farm back under a tenth. */
  honestNeededForTenth: number;
} {
  const { farmMinted, honestMinted } = params;
  const total = farmMinted + honestMinted;
  return {
    farmShare: total === 0 ? 0 : farmMinted / total,
    honestShare: total === 0 ? 0 : honestMinted / total,
    honestNeededForTenth: Math.max(0, farmMinted * 9 - honestMinted),
  };
}

/**
 * Why holding the most light does not mean controlling the record.
 *
 * The second thing I got wrong. Having corrected "farming excludes people" to "farming
 * captures the right to write", that was overstated too, and for a reason worth stating
 * plainly: **a stock of light is not a share of the record.** The picture is made of what
 * was spent, not of what is held.
 *
 * Two things follow.
 *
 * **Hoarding writes nothing.** A farm sitting on light contributes no records at all while
 * real people keep being welcomed and keep writing. Its share of holdings can be 99% while
 * its share of the picture is zero. To control a static picture is to control nothing —
 * and this is the same reason a captured network is a worthless one. If holding Bitcoin
 * were attainable only by the state, Bitcoin would be pointless; whoever captures a
 * network of participation destroys the thing they captured.
 *
 * **Writing liquidates the hoard, and funds the honest network doing it.** A record pays
 * one PIX into the picture and one to the witness who sealed it. The counterparty's share
 * can be recycled if the counterparty is your own puppet, but the picture's share is gone
 * and the witness's share goes to somebody outside the farm. So every record costs the
 * farm two PIX it does not get back, and half of everything it ever spends ends up in the
 * hands of real witnesses.
 *
 * A farm's writing is therefore finite and self-terminating: it buys a burst of records,
 * pays for the privilege, and is broke — having subsidised the witnesses of the network it
 * meant to capture.
 */
export function captureIsSelfLiquidating(params: {
  farmHoldings: number;
  /** True when the counterparty is the farm's own puppet, so that share is recycled. */
  counterpartyInternal?: boolean;
}): {
  netCostPerRecord: number;
  recordsBeforeBroke: number;
  toPicturePermanently: number;
  toHonestWitnesses: number;
  holdingsShareWhileIdle: number;
  recordShareWhileIdle: number;
} {
  const { farmHoldings, counterpartyInternal = true } = params;
  // Picture's share is gone; witness is outside the farm. Counterparty may be recycled.
  const netCostPerRecord = counterpartyInternal ? 2 : 3;
  const records = Math.floor(farmHoldings / netCostPerRecord);
  return {
    netCostPerRecord,
    recordsBeforeBroke: records,
    toPicturePermanently: records,
    toHonestWitnesses: records,
    // The whole point: idle, the farm owns everything and says nothing.
    holdingsShareWhileIdle: 1,
    recordShareWhileIdle: 0,
  };
}

/**
 * The harms that survive both corrections. Farming is still worth making difficult.
 *
 * Kept as data so the test can assert each one is non-empty, rather than as prose that
 * quietly loses an item.
 */
export function survivingHarms(): Array<{ harm: string; why: string }> {
  return [
    {
      harm: "A bounded burst of permanent pollution",
      why:
        "Not control of the record — writing liquidates the hoard, and half of what it " +
        "spends goes to honest witnesses. But the records it does buy are permanent, so " +
        "the burst cannot be cleaned out afterwards.",
    },
    {
      harm: "The on-ramp is destroyed for the poorest",
      why:
        "Burning the subsidy ends free welcoming. After it, being welcomed costs the giver " +
        "a PIX, so somebody whose only contacts also hold nothing cannot get in. The " +
        "subsidy is exactly what serves the people with no light yet.",
    },
    {
      harm: "It is cheap to do undefended",
      why:
        "The entire 78-year subsidy costs around $100M to burn at emulated-camera prices. " +
        "That is one rich enemy, not a nation-state effort.",
    },
    {
      harm: "The pollution is permanent",
      why:
        "Records spend into the picture and the picture never forgets. Farmed records " +
        "cannot be cleaned out later, so the damage is not a temporary distortion.",
    },
  ];
}

export function mintHarmThesis(): Record<string, string> {
  return {
    correction:
      "An earlier version of this module said one farmed PIX was one person who could " +
      "never be welcomed. That was wrong and it overstated the whole Sybil discussion. " +
      "A person can always be given light; whether it is newly minted is irrelevant to them.",
    capGatesMinting:
      "The cap gates minting, never welcoming. An exhausted cap ends the subsidy that " +
      "made giving free — after it, welcoming somebody costs the giver one PIX, which is " +
      "how every gift after the first already works.",
    realHarm:
      "So farming burns subsidy, not seats. The damage is measured in years of free " +
      "welcoming lost, and there is no victim — nobody is excluded, ever.",
    notCaptureEither:
      "The second correction. A stock of light is not a share of the record — the picture is " +
      "made of what was spent, not what is held. Hoarding writes nothing, so a farm can own " +
      "99% and say zero. To control a static picture is to control nothing, which is why a " +
      "captured network of participation is a worthless one.",
    writingLiquidates:
      "And writing empties the hoard while funding the network it meant to capture: every " +
      "record loses one PIX to the picture and one to a witness outside the farm. So the " +
      "burst is finite, self-terminating, and half of everything it spends ends up with " +
      "honest witnesses.",
    stillWorthStopping:
      "None of which makes farming harmless. It destroys the on-ramp for exactly the people " +
      "who have no light yet, the whole subsidy costs about $100M to burn undefended, and " +
      "the records it does buy are permanent. Make it hard — just for the right reasons.",
    horizonAnyway:
      "And the cap could never subsidise everyone. At 132M births a year it is 78 years " +
      "of free welcomes with zero farming, because the cap is peak simultaneous " +
      "population while welcomes accumulate over generations — about 117 billion humans " +
      "have ever lived, eleven times the cap.",
    walletIsNotTheLight:
      "Spending is how light is used, so a puppet that hands its light back holds nothing " +
      "and is finished as a wallet, while the light it carried is still there. Follow the " +
      "light, not the wallet.",
    demandIsGood:
      "People straining to obtain PIX want to write to the picture, which is a use case " +
      "rather than an attack. Adoption and farming differ only in whether a person is " +
      "behind it, which is the one thing that cannot be checked.",
  };
}

/**
 * Bootstrap — breaking the chicken-and-egg without a founder dump.
 *
 * Wrong story:
 *   "1 PIX = $1, therefore 21M PIX = $21M, so we need $21M to start."
 *
 * Right story:
 *   - 21M is a **scarcity schedule**, not a dollar IPO / FDV promise.
 *   - PIX price is **discovered** by trade and bridge quotes over time.
 *   - Day one you do not buy the whole canvas. You light the next cell,
 *     shine in a little value, or receive from someone who already lit.
 *
 * Chicken-and-egg answers:
 *   1) Illumination is open — run a sequencer, paint a pixel, earn light reward.
 *   2) Shine-in needs no prior PIX — dollars lock → escrow releases already-minted PIX
 *      (escrow is filled by illuminators / LPs who earned PIX, not by printing).
 *   3) Light Credits let builders build before they hold PIX.
 *   4) Early eras pay 50 PIX/pixel — same fair-launch shape as early Bitcoin,
 *      without "airdrop me 1000."
 */

import { GENESIS_LIGHT_REWARD, LIGHT_ERA_LENGTH, PIX_HARD_CAP, lightReward } from "./economics";

/** Hard cap is scarcity math — never treat as dollar market cap. */
export const BOOTSTRAP_AXIOM =
  "21,000,000 PIX is a scarcity schedule, not a $21,000,000 IPO. Price is discovered; illumination starts at zero dollars of 'FDV'.";

/**
 * Bridge ingress quote for tests / early pilots — NOT an official peg.
 * Operators publish their own quotes; markets diverge. Never multiply by 21M
 * and call that "the valuation."
 */
export const BOOTSTRAP_INGRESS_PIX_PER_USD = 1;

export type DayOnePathId =
  | "illuminate"
  | "shine_in"
  | "receive"
  | "build_credits"
  | "register_world";

export interface DayOnePath {
  id: DayOnePathId;
  needsPixAlready: boolean;
  needsDollars: boolean;
  whatYouDo: string;
  whatYouGet: string;
}

/** How a human starts today — no premine bag required. */
export const DAY_ONE_PATHS: readonly DayOnePath[] = [
  {
    id: "illuminate",
    needsPixAlready: false,
    needsDollars: false,
    whatYouDo:
      "Run a sovereign node / join the sequencer set; illuminate pending Kindling or heartbeats",
    whatYouGet: `${GENESIS_LIGHT_REWARD} PIX per early pixel (halves every ${LIGHT_ERA_LENGTH} pixels)`,
  },
  {
    id: "shine_in",
    needsPixAlready: false,
    needsDollars: true,
    whatYouDo: "Lock USDC or attest a wire → LockFeeder → PIX to your Personal Source",
    whatYouGet: "PIX from bridge escrow (already minted by illuminators/LPs — not new print)",
  },
  {
    id: "receive",
    needsPixAlready: false,
    needsDollars: false,
    whatYouDo: "Kindling with someone who already holds PIX",
    whatYouGet: "PIX transfer under Presence Seal (self-custody)",
  },
  {
    id: "build_credits",
    needsPixAlready: false,
    needsDollars: false,
    whatYouDo: "Ship apps / SISO / Lumen — spend Light Credits",
    whatYouGet: "Builder fuel without touching the 21M PIX cap",
  },
  {
    id: "register_world",
    needsPixAlready: false,
    needsDollars: false,
    whatYouDo: "Worldlight domain / treasury / app continuity",
    whatYouGet: "Your site or corp record in the light — may use tiny anchor fees later",
  },
] as const;

export interface BootstrapSnapshot {
  axiom: string;
  hardCapPix: number;
  /** Explicitly null — we refuse to publish a dollar FDV from the cap */
  dollarFdvFromCap: null;
  genesisRewardPix: number;
  rewardAtPixel: (index: number) => number;
  eraLength: number;
  ingressQuotePixPerUsd: number;
  ingressQuoteDisclaimer: string;
  dayOne: readonly DayOnePath[];
  chickenEgg: {
    problem: string;
    resolution: string[];
  };
}

export function bootstrapSnapshot(): BootstrapSnapshot {
  return {
    axiom: BOOTSTRAP_AXIOM,
    hardCapPix: PIX_HARD_CAP,
    dollarFdvFromCap: null,
    genesisRewardPix: GENESIS_LIGHT_REWARD,
    rewardAtPixel: lightReward,
    eraLength: LIGHT_ERA_LENGTH,
    ingressQuotePixPerUsd: BOOTSTRAP_INGRESS_PIX_PER_USD,
    ingressQuoteDisclaimer:
      "Ingress PIX-per-USD is a bridge operator quote for pilots — not a peg, not a market cap. Do not multiply by 21M.",
    dayOne: DAY_ONE_PATHS,
    chickenEgg: {
      problem:
        "People need PIX to Kindling, but PIX only exists after illumination — and pricing 1:1 with USD makes the cap look like a $21M buy-in.",
      resolution: [
        "Illumination is the fair launch: no prior PIX required to earn the light reward.",
        "Shine-in needs dollars + a lock, not prior PIX; escrow is filled from earned PIX.",
        "Hard cap ≠ dollar valuation; refuse FDV-from-cap storytelling.",
        "Light Credits unlock building before monetary PIX balance exists.",
        "Early eras (50 PIX/pixel) bootstrap distributors the same way early Bitcoin did — by work of light, not airdrops.",
      ],
    },
  };
}

/** Quote PIX for a USD shine-in without implying a global peg. */
export function quoteIngressPix(amountUsd: number): {
  pix: number;
  quotePixPerUsd: number;
  disclaimer: string;
} {
  const pix = Math.floor(amountUsd * BOOTSTRAP_INGRESS_PIX_PER_USD);
  return {
    pix,
    quotePixPerUsd: BOOTSTRAP_INGRESS_PIX_PER_USD,
    disclaimer: bootstrapSnapshot().ingressQuoteDisclaimer,
  };
}

export const Bootstrap = {
  axiom: BOOTSTRAP_AXIOM,
  paths: DAY_ONE_PATHS,
  snapshot: bootstrapSnapshot,
  quoteIngress: quoteIngressPix,
  ingressPixPerUsd: BOOTSTRAP_INGRESS_PIX_PER_USD,
} as const;

/**
 * The end. What the picture looks like when there is nothing left to write with.
 *
 * Everything else in the economics describes motion — welcoming, giving, recording. This
 * describes the terminus, which nothing had computed. It is closer than it looks and
 * tighter than anyone designed.
 *
 * ## Two clocks, and they are different
 *
 * **The subsidy clock** ends when the cap is minted out: 78 years at 132M births a year.
 * After it, minting stops but the network does not. Welcoming still works, because a person
 * can always be *given* light; it simply costs the giver one PIX instead of being free.
 * See `mint-harm.ts`.
 *
 * **The writing clock** ends later and is the real terminus. Every record puts one PIX into
 * the picture permanently, so circulating supply only ever falls. Gifts move light without
 * consuming it; records consume it. Which means the total number of records the picture can
 * ever hold is fixed by the cap:
 *
 *     10.3e9 PIX / 1 PIX per record = 10.3e9 records, ever
 *
 * And because the cap was set to peak human population, that is **exactly one record per
 * peak-human.** Nobody chose that; it falls out of two decisions made for unrelated
 * reasons. It is the tightest number in the design and it deserves to be deliberate rather
 * than incidental.
 *
 * ## The picture finishes
 *
 * After the last record the light is all in the picture: permanent, nobody's, and
 * unspendable. Nothing further can ever be written. That is not a failure mode — it may be
 * the intended shape, a complete and unalterable record, closer to a cave painting than to
 * a currency. But it must be said out loud, because "one PIX per human forever" describes
 * something else.
 *
 * ## The perverse part
 *
 * Writing a co-signed record means *holding* two PIX. As supply drains, whether the last
 * light is usable depends on how it is spread — and the answer runs against everything else
 * here. Spread evenly, everyone ends holding one PIX, nobody can reach two, and **a third
 * of all light strands permanently unusable.** Pooled, almost none of it does.
 *
 * So the terminal phase pays a premium for concentration. A fair distribution wastes a third
 * of the supply; an unfair one spends nearly all of it. That is a genuine tension with the
 * project's values rather than a rounding error, and it is an argument for supply that
 * renews with presence instead of draining once — `presence-peg.ts` models those regimes.
 */

import { PIX_HARD_CAP } from "./economics";
import { RECORD_TO_PICTURE, COSIGNED_RECORD_COST } from "./economy-model";
import { WORLD_PEAK_POPULATION } from "./presence-peg";

export interface TerminalPicture {
  /** Records the picture can ever hold, across all of history. */
  recordsEver: number;
  /** Records per peak-living human. Falls out at almost exactly 1. */
  recordsPerPeakHuman: number;
  /** Circulating PIX once the last record is written. */
  circulatingAtEnd: number;
  /** What the picture is, after. */
  after: "permanent, nobody's, and unwritable";
}

export function terminalPicture(): TerminalPicture {
  const recordsEver = PIX_HARD_CAP / RECORD_TO_PICTURE;
  return {
    recordsEver,
    recordsPerPeakHuman: recordsEver / WORLD_PEAK_POPULATION,
    circulatingAtEnd: 0,
    after: "permanent, nobody's, and unwritable",
  };
}

/**
 * How much light strands, unusable, depending on how evenly it is held.
 *
 * A co-signed record requires *holding* `COSIGNED_RECORD_COST`. Anyone holding less than
 * that cannot write, however much light exists elsewhere. So the floor is set by
 * distribution rather than by supply, and the fair distribution is the wasteful one.
 *
 * `holdersShare` is the fraction of people who hold anything: 1 for even spread, 0.01 when
 * light has pooled into a hundredth of the population.
 */
export function strandedLight(params: {
  people: number;
  circulating: number;
  holdersShare: number;
}): { stranded: number; strandedShare: number; recordsWritable: number } {
  const { people, circulating, holdersShare } = params;
  const holders = Math.max(1, Math.floor(people * holdersShare));
  // Each holder is left below the writing threshold: up to cost−1 each is unreachable.
  const stranded = Math.min(circulating, holders * (COSIGNED_RECORD_COST - 1));
  return {
    stranded,
    strandedShare: circulating === 0 ? 0 : stranded / circulating,
    recordsWritable: Math.max(0, circulating - stranded) / RECORD_TO_PICTURE,
  };
}

export function endStateThesis(): Record<string, string> {
  return {
    twoClocks:
      "The subsidy ends when the cap is minted out, at 78 years, and the network carries " +
      "on — welcoming just costs the giver a PIX. The writing clock is the real terminus, " +
      "because every record puts one PIX into the picture permanently.",
    theNumber:
      "10.3e9 PIX at one per record is 10.3e9 records ever, which against a cap set to " +
      "peak population is exactly one record per peak-human. Nobody chose that; it falls " +
      "out of two unrelated decisions, and it should be deliberate rather than incidental.",
    theEnd:
      "After the last record the light is all in the picture: permanent, nobody's, " +
      "unspendable. Nothing further can ever be written. Possibly the intended shape — a " +
      "complete and unalterable record, nearer a cave painting than a currency — but it is " +
      "not what 'one PIX per human forever' describes.",
    perverse:
      "Writing needs two PIX in hand, so spread evenly everyone ends holding one and a " +
      "third of all light strands unusable, while pooled almost none does. The terminal " +
      "phase pays a premium for concentration, which runs against everything else here.",
    implication:
      "Both of those argue for supply that renews with presence rather than draining once. " +
      "A fixed cap makes the picture a finite artifact with a computable last page.",
  };
}

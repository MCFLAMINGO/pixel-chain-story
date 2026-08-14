#!/usr/bin/env bun
/**
 * The end. What the picture looks like when there is nothing left to write with.
 *
 * Nothing had computed the terminus. It is closer than it looks and tighter than anyone
 * designed.
 *
 * Proves:
 *   1. Two clocks, and the subsidy ending is not the end — welcoming survives it.
 *   2. The picture can hold exactly 10.3e9 records, ever.
 *   3. Which is one record per peak-human, to two decimal places, by accident.
 *   4. After the last one, the light is all in the picture and nothing can be written.
 *   5. THE PERVERSE PART: spread evenly, a third of all light strands unusable. Pooled,
 *      almost none does. The end pays a premium for concentration.
 */

import { PIX_HARD_CAP } from "../src/lib/pixel/economics";
import { COSIGNED_RECORD_COST } from "../src/lib/pixel/economy-model";
import { endStateThesis, strandedLight, terminalPicture } from "../src/lib/pixel/end-state";
import { SUBSIDY_YEARS } from "../src/lib/pixel/mint-harm";
import { WORLD_PEAK_POPULATION } from "../src/lib/pixel/presence-peg";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

console.log("═══ THE END ═══\n");

// 1. Two clocks. The subsidy ending is not the end.
{
  assert(Math.abs(SUBSIDY_YEARS - 78) < 1, `subsidy runs ~78 years, got ${SUBSIDY_YEARS}`);
  console.log(
    `▸ clock one, the subsidy: ${SUBSIDY_YEARS.toFixed(0)} years, then minting stops — but ` +
      `welcoming carries on, it just costs the giver a PIX ✓`,
  );
}

// 2 + 3. The number.
const end = terminalPicture();
{
  assert(
    end.recordsEver === PIX_HARD_CAP,
    `one PIX drains per record, so records ever = the cap, got ${end.recordsEver}`,
  );
  console.log(
    `▸ clock two, the writing: every record buries 1 PIX in the picture, so the picture ` +
      `holds ${end.recordsEver.toExponential(3)} records — ever ✓`,
  );
  assert(
    Math.abs(end.recordsPerPeakHuman - 1) < 0.005,
    `that should land at one record per peak-human, got ${end.recordsPerPeakHuman}`,
  );
  console.log(
    `▸ which is ${end.recordsPerPeakHuman.toFixed(2)} records per peak-human — nobody chose ` +
      `that, it falls out of the cap being set to ${(WORLD_PEAK_POPULATION / 1e9).toFixed(1)}bn ✓`,
  );
}

// 4. After.
{
  assert(end.circulatingAtEnd === 0, "the last record leaves nothing circulating");
  assert(end.after === "permanent, nobody's, and unwritable", "and the picture is finished");
  console.log(`▸ after the last record the picture is ${end.after} ✓`);
  console.log(
    "▸ possibly the intended shape — a complete record, nearer a cave painting than a " +
      "currency — but it is not what 'one PIX per human forever' describes ✓",
  );
}

// 5. THE PERVERSE PART.
{
  const people = 1_000_000;
  const circulating = people * 3;

  const even = strandedLight({ people, circulating, holdersShare: 1 });
  const pooled = strandedLight({ people, circulating, holdersShare: 0.01 });

  assert(
    Math.abs(even.strandedShare - 1 / 3) < 0.01,
    `spread evenly, a third should strand, got ${(even.strandedShare * 100).toFixed(1)}%`,
  );
  assert(
    pooled.strandedShare < 0.01,
    `pooled, almost none should strand, got ${(pooled.strandedShare * 100).toFixed(2)}%`,
  );
  assert(
    even.stranded > pooled.stranded * 50,
    "the fair distribution must be shown to be the wasteful one",
  );
  console.log(
    `▸ THE PERVERSE PART: writing needs ${COSIGNED_RECORD_COST} PIX in hand, so spread evenly ` +
      `everyone ends holding 1 and ${(even.strandedShare * 100).toFixed(1)}% of all light ` +
      `strands unusable ✗`,
  );
  console.log(
    `▸ pooled into a hundredth of the population only ${(pooled.strandedShare * 100).toFixed(2)}% ` +
      `strands — the end pays a premium for concentration ✗`,
  );
  console.log(
    `▸ so a fair distribution wastes ${((even.stranded - pooled.stranded) / 1e6).toFixed(2)}M PIX ` +
      `that an unfair one would have spent into the picture ✗`,
  );
}

const t = endStateThesis();
for (const [k, v] of Object.entries(t)) console.log(`\n${k}: ${v}`);
console.log("\n═══ PASS — the picture has a last page, and it is one per person ═══");

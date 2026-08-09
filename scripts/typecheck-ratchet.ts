#!/usr/bin/env bun
/**
 * Type errors may go down, never up.
 *
 * CI runs the test suite, Foundry, Cargo and lint — but never `tsc`. So the
 * repository carries type errors that nothing watches, and a change can add more
 * without anything noticing. Turning `tsc` on as a hard gate would block every
 * PR until all of them are fixed, which is why it was presumably never turned on.
 *
 * A ratchet gets the guarantee without the blockage: the current count is
 * recorded, CI fails if a change raises it, and lowering it updates the baseline.
 * The errors get burned down when someone is in the area rather than in one
 * heroic pass, and meanwhile they cannot multiply.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASELINE_FILE = "typecheck-baseline.json";

interface Baseline {
  maxErrors: number;
  note: string;
}

function currentErrors(): { count: number; sample: string[] } {
  const run = spawnSync("bunx", ["tsc", "--noEmit"], { encoding: "utf8" });
  const lines = `${run.stdout ?? ""}${run.stderr ?? ""}`
    .split("\n")
    .filter((l) => /error TS\d+/.test(l));
  return { count: lines.length, sample: lines.slice(0, 10) };
}

const { count, sample } = currentErrors();

const baseline: Baseline = existsSync(BASELINE_FILE)
  ? (JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Baseline)
  : { maxErrors: count, note: "" };

console.log(`type errors: ${count} (ceiling ${baseline.maxErrors})`);

if (count > baseline.maxErrors) {
  console.error(
    `\n✗ ${count - baseline.maxErrors} new type error(s). The ceiling is ${baseline.maxErrors}.\n\n` +
      sample.map((l) => `  ${l}`).join("\n") +
      "\n\n  Fix them, or if you have genuinely lowered the count, run:\n" +
      "    bun run typecheck:accept",
  );
  process.exit(1);
}

if (count < baseline.maxErrors && process.argv.includes("--accept")) {
  writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify(
      {
        maxErrors: count,
        note: "Ceiling only. Lower it by fixing errors; never raise it to make CI pass.",
      },
      null,
      2,
    )}\n`,
  );
  console.log(`▸ ceiling lowered to ${count} ✓`);
} else if (count < baseline.maxErrors) {
  console.log(
    `▸ ${baseline.maxErrors - count} fewer than the ceiling — run \`bun run typecheck:accept\` to lock it in`,
  );
} else {
  console.log("▸ at the ceiling, nothing new ✓");
}

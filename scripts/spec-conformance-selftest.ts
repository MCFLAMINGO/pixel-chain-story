#!/usr/bin/env bun
/**
 * `docs/SPEC.md` says "Normative text is what the tests enforce." This is that test.
 *
 * ## Why it exists
 *
 * The claim was false for five days. §5 specified a hard cap of 21,000,000 and a halving
 * every 210,000 pixels while the code enforced 10,300,000,000 flat — and the line
 * calling the document normative sat three paragraphs above the contradiction. Nothing
 * checked, because nothing could: a specification written only in prose is a
 * specification only a human can falsify, and humans read what they expect.
 *
 * So the constants table in §2.1 is parsed out of the document and compared against the
 * real exports. A value in the spec that no longer matches the code fails the build, in
 * either direction:
 *
 *   - spec drifts behind a code change → caught, which is what happened in August
 *   - code drifts from a deliberate spec → caught, which is the direction that matters
 *     once there is more than one implementation
 *
 * That second direction is the whole point of the exercise. A specification exists so a
 * *second* implementation can be built against it without reading this one. Every
 * constant pinned here is one fewer thing a second client has to guess.
 *
 * ## What this deliberately does not do
 *
 * It does not check prose. §4.2's membership rules and §4.3's block-validity list are
 * enforced by `test:membership`, `test:coverage-harness`, `test:parity` and
 * `test:adversarial` — named in the table at the top of SPEC.md so a reader can follow
 * each claim to the thing that would fail if it stopped being true. Inventing a prose
 * checker here would produce a second, worse consensus implementation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  GENESIS_LIGHT_REWARD,
  LIGHT_HORIZON,
  PIX_BASE_UNITS,
  PIX_HARD_CAP,
} from "../src/lib/pixel/economics";
import { POLS_MAX_FUTURE_DRIFT_MS, POLS_MAX_SKIP, POLS_STALL_MS } from "../src/lib/pixel/pol";
import { MEMBERSHIP_ACTIVATION_DELAY } from "../src/lib/pixel/membership";
import { LEGACY_SIG_ERA_END_HEIGHT } from "../src/lib/pixel/sig-era";
import {
  MAX_BLOCK_TX_BYTES,
  MAX_BLOCK_TXS,
  MAX_GOSSIP_FRAME_BYTES,
  MAX_METADATA_BYTES,
  MAX_PENDING_TX,
  MAX_PIXELS_PER_MESSAGE,
} from "../src/lib/pixel/limits";
import { CROWNED_NETWORK_ID } from "../src/lib/pixel/crowned-genesis";

const root = join(import.meta.dir, "..");
let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

/** The real exports, by the name the spec uses. */
const EXPORTS: Record<string, number> = {
  PIX_HARD_CAP,
  PIX_BASE_UNITS,
  GENESIS_LIGHT_REWARD,
  LIGHT_HORIZON,
  POLS_STALL_MS,
  POLS_MAX_SKIP,
  POLS_MAX_FUTURE_DRIFT_MS,
  MEMBERSHIP_ACTIVATION_DELAY,
  LEGACY_SIG_ERA_END_HEIGHT,
  MAX_BLOCK_TXS,
  MAX_BLOCK_TX_BYTES,
  MAX_METADATA_BYTES,
  MAX_PENDING_TX,
  MAX_PIXELS_PER_MESSAGE,
  MAX_GOSSIP_FRAME_BYTES,
  CROWNED_NETWORK_ID,
};

console.log("═══ SPEC CONFORMANCE — the document is checked, not trusted ═══\n");

const spec = readFileSync(join(root, "docs/SPEC.md"), "utf8");

// ── parse §2.1 ────────────────────────────────────────────────────────────
const section = spec.split("### 2.1 Constants")[1]?.split("\n## ")[0];
check(section != null, "SPEC.md has a §2.1 Constants section");

const rows: Array<{ name: string; value: number; module: string }> = [];
for (const line of (section ?? "").split("\n")) {
  // | `NAME` | `123` | `module.ts` |
  const m = /^\|\s*`([A-Z_][A-Z0-9_]*)`\s*\|\s*`([0-9_]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(line.trim());
  if (m) rows.push({ name: m[1]!, value: Number(m[2]!.replace(/_/g, "")), module: m[3]! });
}
check(rows.length >= 16, `parsed ${rows.length} constants out of the spec table`);

// ── every spec value must equal its export ───────────────────────────────
const mismatches: string[] = [];
for (const row of rows) {
  const actual = EXPORTS[row.name];
  if (actual === undefined) {
    mismatches.push(`${row.name}: spec declares it, code does not export it`);
  } else if (actual !== row.value) {
    mismatches.push(`${row.name}: spec says ${row.value}, code says ${actual}`);
  }
}
check(
  mismatches.length === 0,
  mismatches.length === 0
    ? `all ${rows.length} spec constants match the code exactly`
    : `SPEC/CODE MISMATCH — ${mismatches.join("; ")}`,
);

// ── and every pinned export must appear in the spec ──────────────────────
// Otherwise the table decays into a subset nobody notices shrinking, and a second
// implementation is left guessing at whatever fell out.
const specNames = new Set(rows.map((r) => r.name));
const unspecified = Object.keys(EXPORTS).filter((n) => !specNames.has(n));
check(
  unspecified.length === 0,
  unspecified.length === 0
    ? "every constant a second implementation would need is in the spec"
    : `UNSPECIFIED: ${unspecified.join(", ")} — add to §2.1 or stop pinning it here`,
);

// ── the named modules must be real ───────────────────────────────────────
const badModules = rows.filter((r) => {
  try {
    readFileSync(join(root, "src/lib/pixel", r.module), "utf8");
    return false;
  } catch {
    return true;
  }
});
check(badModules.length === 0, `every cited module exists (${rows.length} citations)`);

// ── the status claim must still point at real tests ──────────────────────
const enforcedBy = [...spec.matchAll(/`(test:[a-z-]+)`/g)].map((m) => m[1]!);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const missingScripts = [...new Set(enforcedBy)].filter((t) => !(t in pkg.scripts));
check(
  missingScripts.length === 0,
  missingScripts.length === 0
    ? `all ${new Set(enforcedBy).size} tests named in SPEC.md actually exist`
    : `SPEC names tests that do not exist: ${missingScripts.join(", ")}`,
);

const allTests = [...new Set(enforcedBy)];
const inAll = pkg.scripts["test:all"] ?? "";
const notRun = allTests.filter((t) => !inAll.includes(t) && t !== "test:all");
check(
  notRun.length === 0,
  notRun.length === 0
    ? "and every one of them runs in test:all"
    : `SPEC cites tests that test:all never runs: ${notRun.join(", ")}`,
);

// ── the economics section must describe the schedule the code implements ─
check(/no halving/.test(spec), "§5 states there is no halving");
check(
  spec.includes(String(PIX_HARD_CAP).replace(/\B(?=(\d{3})+(?!\d))/g, "_")) ||
    spec.includes("10_300_000_000"),
  "§5 states the real cap in the same underscore form the code uses",
);
check(
  /Flat emission: 50 PIX per pixel/.test(spec),
  "§5 states the flat reward rather than implying an era structure",
);

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} spec/code divergence(s) ═══`);
  process.exit(1);
}
console.log("═══ PASS — the spec is a checkable artifact, not a description ═══");

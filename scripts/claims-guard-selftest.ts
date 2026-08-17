#!/usr/bin/env bun
/**
 * No file may state a supply schedule the code does not implement.
 *
 * ## What happened
 *
 * On 11 August the hard cap changed from 21,000,000 to 10,300,000,000 and the emission
 * from a Bitcoin-style halving to a flat 50 PIX per pixel. The constant changed. Nine
 * documents and six source files did not — including `docs/SPEC.md`, which calls itself
 * normative and went on specifying "Halving every 210_000 pixels; Cap: 21_000_000", and
 * `bootstrap.ts`, which told users in a live product string that their reward "halves
 * every 210,000 pixels".
 *
 * For five days the repository shipped code that enforced one monetary policy and
 * documentation that described another. Nobody was lying; the change simply outran its
 * own paperwork, which is what always happens when the paperwork is checked by memory.
 *
 * ## Why an allowlist and not a ban
 *
 * Banning the figure outright would be worse than the drift. `EMISSION.md` earns its
 * keep precisely by explaining *why* 21,000,000 was rejected, and a guard that forces
 * that history to be deleted would trade a documentation bug for an honesty bug. The
 * repo would forget its own reasoning to satisfy a regex.
 *
 * So every surviving mention is registered here with a reason, the same way the coverage
 * harness registers every consensus field. A new mention anywhere fails the build until
 * someone writes down why it is history rather than a claim. Diligence is not the
 * mechanism; the count is.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  GENESIS_LIGHT_REWARD,
  LIGHT_HORIZON,
  PIX_HARD_CAP,
  PIX_SCHEDULE_TOTAL,
  lightReward,
  mintedThrough,
} from "../src/lib/pixel/economics";

const root = join(import.meta.dir, "..");
let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

/** Figures and phrases that described the superseded schedule. */
const STALE = [
  /21[,_]000[,_]000/g,
  /\b21M\b/g,
  /20[,_]370[,_]000/g,
  /\bhalving\b/gi,
  /\bhalves every\b/gi,
  /LIGHT_ERA_LENGTH/g,
];

/**
 * Where a superseded figure is still allowed to appear, and why.
 *
 * `count` is exact on purpose. An approximate ceiling would let a new claim hide behind
 * an old one in the same file, which is the failure this guard exists to prevent.
 */
const HISTORICAL: Record<string, { count: number; why: string }> = {
  "docs/EMISSION.md": {
    count: 13,
    why: "the record of how the ceiling was decided; superseded sections are marked inline",
  },
  "docs/STATE-2026-08-13.md": {
    count: 3,
    why: "a dated snapshot — rewriting a state note to match later facts would make it a lie",
  },
  "src/lib/pixel/economics.ts": {
    count: 5,
    why: "explains what the number used to be and why it changed, next to the constant",
  },
  "docs/SPEC.md": {
    count: 3,
    why: "names the absent halving in §5, and the status note records the five-day drift that made this guard necessary",
  },
  "docs/VALUE-SOVEREIGNTY-BRIDGE.md": {
    count: 1,
    why: "a comparison row citing Bitcoin's actual 21,000,000 cap, which really is 21,000,000",
  },
  "scripts/scale-thesis-selftest.ts": {
    count: 4,
    why: "probes pixel 210,000 — where the old halving bit — to catch a reintroduction",
  },
  "scripts/bootstrap-selftest.ts": {
    count: 2,
    why: "records why the axiom assertion stopped keying on a dollar figure",
  },
  "scripts/vectors-generate.ts": {
    count: 1,
    why: "the emission vector's note says 'Flat, not halving' — naming the absence for a second implementation",
  },
  "scripts/spec-conformance-selftest.ts": {
    count: 4,
    why: "asserts SPEC.md still says 'no halving', and explains the drift it was written to catch",
  },
};

const SEARCH_DIRS = ["docs", "src", "scripts"];
const SEARCH_FILES = ["README.md", "llms.txt"];
const SKIP = /node_modules|routeTree\.gen\.ts|\.png$|\.jpg$|\.svg$|\.ico$|\.woff/;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP.test(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|md|txt|json|sol|rs)$/.test(entry)) out.push(full);
  }
}

console.log("═══ CLAIMS GUARD — the code is the source of truth ═══\n");

// ── 1. the schedule the code actually implements ──────────────────────────
check(PIX_HARD_CAP === 10_300_000_000, `hard cap is ${PIX_HARD_CAP.toLocaleString()}`);
check(GENESIS_LIGHT_REWARD === 50, `reward is a flat ${GENESIS_LIGHT_REWARD} PIX`);
check(
  lightReward(0) === lightReward(210_000) && lightReward(210_000) === lightReward(1_000_000),
  "the reward does not halve — 0, 210,000 and 1,000,000 all pay the same",
);
check(
  lightReward(LIGHT_HORIZON) === 0,
  `emission stops at the horizon (${LIGHT_HORIZON.toLocaleString()})`,
);
check(
  PIX_SCHEDULE_TOTAL === PIX_HARD_CAP,
  "the schedule reaches the ceiling EXACTLY — no unreachable remainder",
);
check(
  mintedThrough(LIGHT_HORIZON) === PIX_HARD_CAP,
  "and replaying the whole horizon lands on the same number",
);

// ── 2. no file states a schedule the code does not implement ─────────────
const files: string[] = [];
for (const d of SEARCH_DIRS) walk(join(root, d), files);
for (const f of SEARCH_FILES) files.push(join(root, f));

const found: Record<string, number> = {};
for (const file of files) {
  const rel = relative(root, file);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (rel === "scripts/claims-guard-selftest.ts") continue;
  let n = 0;
  for (const re of STALE) n += (text.match(re) ?? []).length;
  if (n > 0) found[rel] = n;
}

const unregistered = Object.keys(found).filter((f) => !(f in HISTORICAL));
check(
  unregistered.length === 0,
  unregistered.length === 0
    ? `no unregistered mention of the superseded schedule (${Object.keys(found).length} registered file(s))`
    : `UNREGISTERED superseded-schedule mentions: ${unregistered
        .map((f) => `${f} (${found[f]})`)
        .join(", ")} — fix the claim, or register it here with a reason`,
);

const drifted = Object.entries(HISTORICAL)
  .filter(([f, spec]) => (found[f] ?? 0) !== spec.count)
  .map(([f, spec]) => `${f}: registered ${spec.count}, found ${found[f] ?? 0}`);
check(
  drifted.length === 0,
  drifted.length === 0
    ? "every registered file has exactly the number of historical mentions it declares"
    : `COUNT DRIFT: ${drifted.join("; ")} — a new claim cannot hide behind an old one`,
);

check(
  Object.values(HISTORICAL).every((h) => h.why.trim().length > 20),
  "every registered exemption explains itself",
);

// ── 3. the load-bearing files say the right thing outright ───────────────
const spec = readFileSync(join(root, "docs/SPEC.md"), "utf8");
check(spec.includes("10_300_000_000"), "SPEC.md — the normative document — states the real cap");
check(!/Cap: 21_000_000/.test(spec), "SPEC.md no longer specifies the superseded cap");
check(
  /no halving/.test(spec),
  "SPEC.md states the absence of a halving rather than leaving it unsaid",
);

const bootstrap = readFileSync(join(root, "src/lib/pixel/bootstrap.ts"), "utf8");
check(
  !/halves every/.test(bootstrap),
  "bootstrap.ts no longer advertises a halving to users in a product string",
);

// ── 4. durability overclaims (Bitcoin-shaped survival ahead of evidence) ─
//
// Same shape as the supply guard: name the forbidden present-tense claims, allow
// exact historical / definitional mentions with a reason. Aspiration blocks marked
// in docs are stripped before counting so a roadmap sentence can exist without
// becoming a product claim.
console.log("\n── durability grades (docs/DURABILITY.md) ──\n");

const DURABILITY_STALE = [
  /\bdecentralized network\b/gi,
  /\bfully decentralized\b/gi,
  /\bpermissionless mining\b/gi,
  /\banyone can sequence\b/gi,
  /\bno single point of failure\b/gi,
  /\bBitcoin-class\b/gi,
  /\bruns without anyone\b/gi,
  /\bruns forever without\b/gi,
  /\bhost-independent\b/gi,
];

/** Strip marked aspiration so future tense can be written without failing the build. */
function stripAspiration(text: string): string {
  return text
    .replace(/<!--\s*durability-aspiration\s*-->[\s\S]*?<!--\s*\/durability-aspiration\s*-->/gi, "")
    .replace(/^Aspiration —.*$/gm, "");
}

/**
 * Mentions that name the ban, warn against SPOF, or quote Bitcoin — not Pixel claims.
 * Counts are exact so a new claim cannot hide behind an old line.
 */
const DURABILITY_OK: Record<string, { count: number; why: string }> = {
  "docs/DURABILITY.md": {
    count: 11,
    why: "the honesty map that lists the forbidden phrases and the honest sentence that negates them",
  },
  "src/lib/pixel/anchor-venues.ts": {
    count: 0,
    why: "warns that one venue is a single point of failure — uses the phrase as a defect, not a claim",
  },
  "src/lib/pixel/anchor.ts": {
    count: 0,
    why: "same venue SPOF warning in prose",
  },
  "scripts/anchor-deploy.ts": {
    count: 0,
    why: "same venue SPOF warning printed to operators",
  },
};

// Recompute: "single point of failure" without the leading "no " is a warning we keep.
// Only "no single point of failure" is in DURABILITY_STALE. Venue files should have count 0
// of the stale set; register them so a future slip is noticed if they ever claim "no SPOF".

const durabilityFound: Record<string, number> = {};
for (const file of files) {
  const rel = relative(root, file);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (rel === "scripts/claims-guard-selftest.ts") continue;
  const body = stripAspiration(text);
  let n = 0;
  for (const re of DURABILITY_STALE) {
    re.lastIndex = 0;
    n += (body.match(re) ?? []).length;
  }
  if (n > 0) durabilityFound[rel] = n;
}

const durabilityUnreg = Object.keys(durabilityFound).filter((f) => !(f in DURABILITY_OK));
check(
  durabilityUnreg.length === 0,
  durabilityUnreg.length === 0
    ? `no unregistered durability overclaim (${Object.keys(durabilityFound).length} registered file(s))`
    : `UNREGISTERED durability overclaim(s): ${durabilityUnreg
        .map((f) => `${f} (${durabilityFound[f]})`)
        .join(", ")} — soften the claim, mark Aspiration —, or register in DURABILITY_OK`,
);

const durabilityDrift = Object.entries(DURABILITY_OK)
  .filter(([f, spec]) => (durabilityFound[f] ?? 0) !== spec.count)
  .map(([f, spec]) => `${f}: registered ${spec.count}, found ${durabilityFound[f] ?? 0}`);
check(
  durabilityDrift.length === 0,
  durabilityDrift.length === 0
    ? "every registered durability exemption has exactly its declared mention count"
    : `DURABILITY COUNT DRIFT: ${durabilityDrift.join("; ")}`,
);

const durabilityDoc = readFileSync(join(root, "docs/DURABILITY.md"), "utf8");
check(
  /Not a permissionless network; not host-independent/.test(durabilityDoc),
  "DURABILITY.md states the honest present-tense sentence",
);
check(
  /invitation-only/.test(durabilityDoc) && /hybrid/i.test(durabilityDoc),
  "DURABILITY.md records invitation-today and hybrid-designed",
);

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} claim(s) out of step with the code ═══`);
  process.exit(1);
}
console.log("═══ PASS — one schedule, stated once; durability claims graded ═══");

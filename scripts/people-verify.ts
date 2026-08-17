#!/usr/bin/env bun
/**
 * People path — verify the crowned picture without becoming an operator.
 *
 *   bun run people:verify              # offline fixture (air-gap safe)
 *   bun run people:verify -- --live    # live tip + optional eth_call anchors
 *
 * Phones stay on /wallet. This is the laptop/USB analogue of "I checked it myself."
 * It never asks for a Railway account, never runs membership, never sequences.
 */

import { spawn } from "bun";
import { join } from "node:path";

import {
  CROWNED_GENESIS_PREFIX,
  CROWNED_NETWORK_ID,
} from "../src/lib/pixel/crowned-genesis";

const ROOT = join(import.meta.dir, "..");
const live = process.argv.includes("--live");

console.log("Pixel — people verify");
console.log("─────────────────────");
console.log(`Network ${CROWNED_NETWORK_ID} · confirm genesis out loud: ${CROWNED_GENESIS_PREFIX}…`);
console.log(
  live
    ? "Mode: live tip (+ anchors when reachable)"
    : "Mode: offline fixture (no network required)",
);
console.log("You are verifying — not sequencing. Sequencing stays invitation-only today.");
console.log("Phones: /wallet · durability grades: docs/DURABILITY.md\n");

const args = live
  ? ["scripts/verify-crowned.ts"]
  : ["scripts/verify-crowned.ts", "--fixture", "fixtures/crowned-47.json"];

const proc = spawn({
  cmd: ["bun", ...args],
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
});
const code = await proc.exited;
if (code !== 0) process.exit(code ?? 1);

console.log("\nNext (optional, still not sequencing):");
console.log("  bun run pixel -- join --public-tip --datadir ./pixel-data --require-crowned");
console.log("  # read genesis prefix back over a second channel");

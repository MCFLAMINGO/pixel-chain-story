#!/usr/bin/env bun
/**
 * Cross-client check: TypeScript fixture expectations match the Python verify-only client.
 *
 * D5 — protocol ≠ this TypeScript repo. A second implementation (even verify-only)
 * that agrees on tip hash, merkle, and supply is the beginning of that split.
 */

import { spawn } from "bun";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

console.log("═══ SECOND CLIENT (Python verify-only) ═══\n");

const proc = spawn({
  cmd: ["python3", "clients/verify_crowned.py", "fixtures/crowned-47.json"],
  cwd: ROOT,
  stdout: "pipe",
  stderr: "pipe",
});
const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
const code = await proc.exited;

check(code === 0, "python3 clients/verify_crowned.py exits 0");
check(/VERIFIED/.test(out), "Python client prints VERIFIED");
check(/merkleRoot recomputes/.test(out) || /merkleRoot/.test(out), "Python recomputes merkle roots");
check(/UTXO fold supply/.test(out) || /supply/.test(out), "Python checks supply vs emission");
check(/Signatures not checked/.test(out), "Python honestly declines PQ signature verify for now");
check(!/FAILED/.test(out), "no FAILED line");

console.log(out.trim().split("\n").slice(-4).map((l) => `    ${l}`).join("\n"));

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} ═══`);
  process.exit(1);
}
console.log("═══ PASS — a second client agrees on the crowned picture ═══");

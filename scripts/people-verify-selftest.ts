#!/usr/bin/env bun
/**
 * people:verify must work offline and must not touch membership / sequencing.
 */

import { spawn } from "bun";
import { readFileSync } from "node:fs";
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

console.log("═══ PEOPLE VERIFY ═══\n");

const src = readFileSync(join(ROOT, "scripts/people-verify.ts"), "utf8");
check(!/submitMembership|sequenceBlock|createSequencerJoin/.test(src), "people:verify never sequences");
check(!/^import .*membership/m.test(src), "people:verify does not import membership");
check(/DURABILITY/.test(src), "people:verify points at DURABILITY.md");
check(/offline fixture|fixture/.test(src), "default path is offline fixture");

{
  const proc = spawn({
    cmd: ["bun", "scripts/people-verify.ts"],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
  const code = await proc.exited;
  check(code === 0, "people:verify exits 0 offline");
  check(/VERIFIED|source: committed fixture/i.test(out), "offline run reports verified fixture");
  check(/skipped under --fixture|air-gap/i.test(out), "offline run skips eth_call anchors");
  check(/f1d193f62d54e982/.test(out), "prints genesis prefix for out-loud confirm");
}

{
  const proc = spawn({
    cmd: ["bun", "scripts/verify-crowned.ts", "--fixture", "fixtures/crowned-47.json", "--offline"],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
  const code = await proc.exited;
  check(code === 0, "verify:crowned --fixture PATH --offline exits 0");
  check(/fixture:.*crowned-47/.test(out), "accepts explicit fixture path");
}

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} ═══`);
  process.exit(1);
}
console.log("═══ PASS — people can verify without becoming operators ═══");

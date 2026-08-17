#!/usr/bin/env bun
/**
 * Hosting independence + tip RPC candidates — cattle, not existence.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PUBLIC_TIP_RPC_DEFAULT } from "../src/lib/pixel/crowned-genesis";
import { tipRpcCandidates } from "../src/lib/pixel-rpc";

const ROOT = join(import.meta.dir, "..");

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

console.log("═══ HOSTING INDEPENDENCE ═══\n");

const hosting = readFileSync(join(ROOT, "docs/HOSTING-INDEPENDENCE.md"), "utf8");
check(/Tip host migration/i.test(hosting), "runbook has tip migration section");
check(/content-addressed/i.test(hosting), "runbook names content-addressed backups");
check(/anchor/i.test(hosting) && /split/i.test(hosting), "runbook splits tip vs anchors");
check(/ceremony-pack/i.test(hosting), "runbook points at ceremony pack as non-GitHub path");
check(!/\bno single point of failure\b/i.test(hosting), "runbook does not claim no SPOF");

const vectors = readFileSync(join(ROOT, "docs/VECTORS.md"), "utf8");
check(/Implementer checklist/i.test(vectors), "VECTORS.md has implementer checklist");
check(/second-client:/i.test(vectors), "VECTORS.md invites second-client issues");

const llms = readFileSync(join(ROOT, "llms.txt"), "utf8");
check(/DURABILITY/.test(llms) && /VECTORS/.test(llms), "llms.txt indexes durability + vectors");
check(/HOSTING-INDEPENDENCE/.test(llms), "llms.txt indexes hosting independence");

const candidates = tipRpcCandidates();
check(candidates.includes(PUBLIC_TIP_RPC_DEFAULT), "candidates include default tip");
check(candidates[0] === PUBLIC_TIP_RPC_DEFAULT, "default is first when no override");
check(
  tipRpcCandidates("http://127.0.0.1:8545")[0] === "http://127.0.0.1:8545",
  "explicit override sorts first",
);
check(
  new Set(tipRpcCandidates()).size === tipRpcCandidates().length,
  "candidates are deduped",
);

const spec = readFileSync(join(ROOT, "docs/SPEC.md"), "utf8");
check(/4\.2\.1 Hybrid bond door \(DRAFT/.test(spec), "SPEC drafts hybrid bond door as non-normative");
check(/not shipped/i.test(spec), "SPEC draft says not shipped");

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} ═══`);
  process.exit(1);
}
console.log("═══ PASS — hosting is cattle; second client has a written door ═══");

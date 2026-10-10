#!/usr/bin/env bun
/**
 * Mirror-host pack is crowned-Earth only — downloadable, openable, no new genesis.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { CROWNED_GENESIS_PREFIX, CROWNED_NETWORK_ID } from "../src/lib/pixel/crowned-genesis";

const ROOT = join(import.meta.dir, "..");
let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

console.log("═══ MIRROR HOST PACK (one Earth only) ═══\n");

const build = spawnSync("bun", ["scripts/build-mirror-host-pack.ts"], {
  cwd: ROOT,
  encoding: "utf8",
});
check(build.status === 0, `mirror:pack builds${build.status !== 0 ? ` — ${build.stderr}` : ""}`);

const pack = join(ROOT, "public/mirror-host");
const zip = join(ROOT, "public/mirror-host.zip");
check(existsSync(zip) && statSync(zip).size > 100, "public/mirror-host.zip exists");
check(existsSync(join(pack, "OPEN-ME.html")), "OPEN-ME.html present");
check(existsSync(join(pack, "start-mirror.sh")), "start-mirror.sh present");
check(existsSync(join(pack, "start-mirror.ps1")), "start-mirror.ps1 present");
check(existsSync(join(pack, "start-mirror.bat")), "start-mirror.bat present");

const crowned = JSON.parse(readFileSync(join(pack, "CROWNED.json"), "utf8")) as {
  networkId: number;
  genesisPrefix: string;
  role: string;
};
check(crowned.networkId === CROWNED_NETWORK_ID, `pin networkId ${CROWNED_NETWORK_ID}`);
check(crowned.genesisPrefix === CROWNED_GENESIS_PREFIX, `pin genesis ${CROWNED_GENESIS_PREFIX}`);
check(crowned.role === "verifying-mirror-only", "role is verifying-mirror-only");

for (const f of ["start-mirror.sh", "start-mirror.ps1"]) {
  const body = readFileSync(join(pack, f), "utf8");
  check(body.includes("--require-crowned"), `${f} passes --require-crowned`);
  check(body.includes("--public-tip"), `${f} uses --public-tip`);
  check(!/PIXEL_GENESIS_CEREMONY=1/.test(body), `${f} does not enable genesis ceremony`);
  check(!/\btip:host\b/.test(body) || /Never tip:host/.test(body), `${f} does not run tip:host`);
  check(!/\binit --datadir\b/.test(body), `${f} does not pixel init`);
  check(body.includes(CROWNED_GENESIS_PREFIX), `${f} pins genesis prefix`);
}

const openMe = readFileSync(join(pack, "OPEN-ME.html"), "utf8");
check(openMe.includes(CROWNED_GENESIS_PREFIX), "OPEN-ME pins genesis");
check(/one Earth|crowned/i.test(openMe), "OPEN-ME says one Earth");
check(/Not a wallet|not a wallet/i.test(openMe), "OPEN-ME says not a wallet");

const route = readFileSync(join(ROOT, "src/routes/mirror.tsx"), "utf8");
check(route.includes('createFileRoute("/mirror")'), "/mirror route exists");
check(route.includes("mirror-host.zip"), "/mirror links the zip");
check(route.includes("CROWNED_GENESIS_PREFIX"), "/mirror shows crowned pin");
check(
  !/PIXEL_GENESIS_CEREMONY|tip:host as the path/i.test(route),
  "/mirror does not push tip:host",
);

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} ═══`);
  process.exit(1);
}
console.log("═══ PASS — mirror pack is crowned-only and downloadable ═══");

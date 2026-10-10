#!/usr/bin/env bun
/**
 * Build public/mirror-host.zip — crowned-Earth verifying mirror pack only.
 * Refuses to include tip:host / init pathways in the zip contents.
 */

import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  CROWNED_GENESIS_HASH,
  CROWNED_GENESIS_PREFIX,
  CROWNED_NETWORK_ID,
  PUBLIC_TIP_RPC_DEFAULT,
} from "../src/lib/pixel/crowned-genesis";

const ROOT = join(import.meta.dir, "..");
const PACK = join(ROOT, "public/mirror-host");
const ZIP = join(ROOT, "public/mirror-host.zip");

mkdirSync(PACK, { recursive: true });

// Refresh pin from source of truth.
writeFileSync(
  join(PACK, "CROWNED.json"),
  `${JSON.stringify(
    {
      $comment: "Hard pin — this pack only joins the one crowned tip. Never init. Never tip:host.",
      networkId: CROWNED_NETWORK_ID,
      genesisPrefix: CROWNED_GENESIS_PREFIX,
      genesisHash: CROWNED_GENESIS_HASH,
      primaryRpc: PUBLIC_TIP_RPC_DEFAULT,
      repo: "https://github.com/MCFLAMINGO/pixel-chain-story.git",
      role: "verifying-mirror-only",
      forbidden: ["pixel init", "tip:host", "PIXEL_GENESIS_CEREMONY", "new Earth"],
    },
    null,
    2,
  )}\n`,
);

copyFileSync(join(ROOT, "tip-mirrors.json"), join(PACK, "tip-mirrors.json"));

const required = [
  "OPEN-ME.html",
  "README.txt",
  "CROWNED.json",
  "tip-mirrors.json",
  "start-mirror.sh",
  "start-mirror.ps1",
  "start-mirror.bat",
];
for (const f of required) {
  const p = join(PACK, f);
  if (!statSync(p).isFile()) throw new Error(`mirror-host pack missing ${f}`);
}

// Guard: starter scripts must require crowned and must not advertise tip:host as the path.
for (const f of ["start-mirror.sh", "start-mirror.ps1", "OPEN-ME.html", "README.txt"]) {
  const body = readFileSync(join(PACK, f), "utf8");
  if (!body.includes(CROWNED_GENESIS_PREFIX)) {
    throw new Error(`${f} must pin genesis prefix ${CROWNED_GENESIS_PREFIX}`);
  }
  if (!/require-crowned|one Earth|crowned/i.test(body) && f.startsWith("start-")) {
    throw new Error(`${f} must require crowned join`);
  }
  if (f.startsWith("start-") && !body.includes("--require-crowned")) {
    throw new Error(`${f} must pass --require-crowned`);
  }
  if (f.startsWith("start-") && /PIXEL_GENESIS_CEREMONY=1/.test(body)) {
    throw new Error(`${f} must not enable genesis ceremony`);
  }
}

// Zip (prefer system zip).
const files = readdirSync(PACK).filter((n) => !n.startsWith("."));
const zip = spawnSync("zip", ["-q", "-r", ZIP, ...files.map((f) => `mirror-host/${f}`)], {
  cwd: join(ROOT, "public"),
  encoding: "utf8",
});
if (zip.status !== 0) {
  // Fallback: write a tiny note; CI/Linux usually has zip.
  throw new Error(`zip failed: ${zip.stderr || zip.stdout || zip.status}`);
}

console.log(`▸ wrote ${ZIP} (${statSync(ZIP).size} bytes)`);
console.log(`▸ crowned-only mirror pack · ${CROWNED_GENESIS_PREFIX}… · net ${CROWNED_NETWORK_ID}`);

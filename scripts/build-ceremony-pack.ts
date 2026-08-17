#!/usr/bin/env bun
/**
 * Refresh fixtures/ceremony-pack/manifest.json hashes + tip-mirrors/anchors copies.
 * Large fixtures (crowned-47, protocol vectors) stay as siblings — not duplicated in git.
 */

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  CROWNED_GENESIS_HASH,
  CROWNED_GENESIS_PREFIX,
  CROWNED_NETWORK_ID,
  PUBLIC_TIP_RPC_DEFAULT,
} from "../src/lib/pixel/crowned-genesis";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "fixtures/ceremony-pack");
mkdirSync(OUT, { recursive: true });

copyFileSync(join(ROOT, "tip-mirrors.json"), join(OUT, "tip-mirrors.json"));
copyFileSync(join(ROOT, "anchors.json"), join(OUT, "anchors.json"));

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const manifest = {
  networkId: CROWNED_NETWORK_ID,
  genesisHash: CROWNED_GENESIS_HASH,
  genesisPrefix: CROWNED_GENESIS_PREFIX,
  defaultTip: PUBLIC_TIP_RPC_DEFAULT,
  files: {
    "tip-mirrors.json": sha256(join(OUT, "tip-mirrors.json")),
    "anchors.json": sha256(join(OUT, "anchors.json")),
    "../crowned-47.json": sha256(join(ROOT, "fixtures/crowned-47.json")),
    "../vectors/protocol-v1.json": sha256(join(ROOT, "fixtures/vectors/protocol-v1.json")),
  },
  builtAt: new Date().toISOString(),
};
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`ceremony pack refreshed → ${OUT}`);
console.log(`  genesis ${CROWNED_GENESIS_PREFIX}…`);
console.log(`  crowned-47 sha256 ${manifest.files["../crowned-47.json"].slice(0, 16)}…`);

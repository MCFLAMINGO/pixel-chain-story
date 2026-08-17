#!/usr/bin/env bun
/**
 * Tip failover — the tip host is cattle.
 *
 * Lab network (not 20553):
 *   1. Operator A runs a tip and advances a few pixels
 *   2. Take a keyless backup (Tier 1 copy)
 *   3. Kill A
 *   4. Restore the backup onto B's datadir and start B as the new tip host
 *      (B forges its own identity — the backup did not carry A's key)
 *   5. Friend C joins via a mirrors file that lists dead A first, then live B
 *   6. Assert C holds the same tip hash A had
 *
 * This does not prove crowned succession (that needs the producer key). It proves
 * the history is not trapped inside one process: a verifying copy + a new host is
 * enough for strangers to keep reading and joining.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn, type Subprocess } from "bun";
import { join } from "node:path";

import { createBackup } from "../src/node/backup";
import { loadChain, loadOrCreateIdentity, saveChain } from "../src/node/store";
import { tipHash, verifyChain } from "../src/lib/pixel/index";

const ROOT = join(import.meta.dir, "..");
const BASE = `/tmp/pixel-tip-failover-${process.pid}`;
const RPC_A = 19100 + (process.pid % 400);
const RPC_B = RPC_A + 1;
const GOSSIP_A = 19600 + (process.pid % 400);
const GOSSIP_B = GOSSIP_A + 1;

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

const procs = new Map<string, Subprocess>();

function startNode(tag: string, datadir: string, rpc: number, gossip: number) {
  const proc = spawn({
    cmd: [
      "bun",
      "src/node/cli.ts",
      "node",
      "--datadir",
      datadir,
      "--rpc",
      String(rpc),
      "--gossip",
      String(gossip),
      "--advertise",
      "127.0.0.1",
    ],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PIXEL_ALLOW_LAB_GENESIS: "1" },
  });
  procs.set(tag, proc);
  return proc;
}

async function waitHealth(url: string, ms = 20_000): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`${url}/health`);
      if (r.ok) return (await r.json()) as Record<string, unknown>;
    } catch {
      /* retry */
    }
    await Bun.sleep(200);
  }
  throw new Error(`health timeout: ${url}`);
}

async function kill(tag: string): Promise<void> {
  const p = procs.get(tag);
  if (!p) return;
  p.kill();
  try {
    await p.exited;
  } catch {
    /* */
  }
  procs.delete(tag);
}

console.log("═══ TIP FAILOVER ═══\n");

await rm(BASE, { recursive: true, force: true });
await mkdir(BASE, { recursive: true });
const dirA = join(BASE, "a");
const dirB = join(BASE, "b");
const dirC = join(BASE, "c");
await mkdir(dirA, { recursive: true });

// Forge lab datadir A
{
  const p = spawn({
    cmd: ["bun", "scripts/lab-forge-datadir.ts", "--datadir", dirA],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PIXEL_ALLOW_LAB_GENESIS: "1" },
  });
  const code = await p.exited;
  check(code === 0, "lab-forge-datadir for operator A");
}

startNode("A", dirA, RPC_A, GOSSIP_A);
const healthA = await waitHealth(`http://127.0.0.1:${RPC_A}`);
check(healthA.advertiseIsLocalhost === true, "/health reports advertiseIsLocalhost when --advertise is loopback");
check(typeof healthA.tipHash === "string", "A has a tip hash");
const tipBefore = String(healthA.tipHash);

// Advance a couple of pixels via faucet if available, else accept tip-at-genesis
{
  try {
    await fetch(`http://127.0.0.1:${RPC_A}/faucet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: healthA.address, amount: 1 }),
    });
    await Bun.sleep(500);
  } catch {
    /* faucet may be off */
  }
}
const healthA2 = await waitHealth(`http://127.0.0.1:${RPC_A}`);
const tipAtBackup = String(healthA2.tipHash);
const pixelsAtBackup = Number(healthA2.pixels);

const chainA = await loadChain(dirA);
check(chainA && (await verifyChain(chainA)), "A's on-disk chain verifies");
const { identity: identityA } = await loadOrCreateIdentity(dirA, "a");
const backup = await createBackup({ chain: chainA!, identity: identityA });
check(!backup.manifest.carriesKey, "default backup does not carry the producer key");
const backupPath = join(BASE, "tier1-backup.json");
await writeFile(backupPath, JSON.stringify(backup));

await kill("A");
await Bun.sleep(300);

// Restore history onto B without A's key — B forges its own identity
await mkdir(dirB, { recursive: true });
const restored = await (await import("../src/node/backup")).readBackup(
  await Bun.file(backupPath).text(),
);
await saveChain(dirB, restored.chain);
await loadOrCreateIdentity(dirB, "b-replacement-host");
check(await verifyChain(restored.chain), "restored backup verifies before B starts");
check(tipHash(restored.chain) === tipAtBackup, "backup tip matches A's tip at backup time");

startNode("B", dirB, RPC_B, GOSSIP_B);
const healthB = await waitHealth(`http://127.0.0.1:${RPC_B}`);
check(Number(healthB.pixels) === pixelsAtBackup, "B serves the same pixel count");
check(String(healthB.tipHash) === tipAtBackup, "B's tip hash matches the backup");
check(String(healthB.address) !== String(healthA.address), "B has a different key than A (keyless backup)");

const mirrorsPath = join(BASE, "mirrors.json");
await writeFile(
  mirrorsPath,
  JSON.stringify({
    networkId: restored.chain.networkId,
    genesisHash: restored.chain.pixels[0]!.hash,
    mirrors: [
      { id: "dead-a", rpc: `http://127.0.0.1:${RPC_A}` },
      { id: "live-b", rpc: `http://127.0.0.1:${RPC_B}` },
    ],
  }),
);

await mkdir(dirC, { recursive: true });
{
  const p = spawn({
    cmd: [
      "bun",
      "src/node/cli.ts",
      "join",
      "--mirrors",
      mirrorsPath,
      "--datadir",
      dirC,
    ],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(p.stdout).text();
  const err = await new Response(p.stderr).text();
  const code = await p.exited;
  check(code === 0, `friend C joins via mirrors (dead A → live B)\n${out}\n${err}`);
  check(/live-b|Joined/.test(out), "join log names the live mirror");
}

const chainC = await loadChain(dirC);
check(chainC != null && (await verifyChain(chainC!)), "C's joined chain verifies");
check(tipHash(chainC!) === tipAtBackup, "C converged on the same tip hash after A died");
check(tipBefore.length > 0, "recorded A's earlier tip for the story");

await kill("B");
await rm(BASE, { recursive: true, force: true });

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} ═══`);
  process.exit(1);
}
console.log("═══ PASS — tip host died; history lived; friend joined the replacement ═══");

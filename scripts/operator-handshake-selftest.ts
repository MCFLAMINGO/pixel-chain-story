#!/usr/bin/env bun
/**
 * The two-machine operator handshake — neither side ever holds the other's key.
 *
 * `membership invite` needs both datadirs on one machine. That is fine for bootstrap and
 * useless for a real second operator: you would need their private key, which defeats the
 * point of possession being a separate signature at all.
 *
 * So this exercises the split form the way it will actually be used — two datadirs, two
 * `pixel` invocations, one JSON file passed between them — and asserts the property that
 * makes it safe: **no secret crosses the wire.**
 *
 * The one wrinkle worth understanding is why the request carries a *window* of signatures.
 * `includedAt` is inside the signed claim, so both signers must agree on the height before
 * the record is committed — and a joiner cannot know when the incumbent will get round to
 * authorising them. Fixing that in the CLI rather than in the record format is deliberate:
 * the format is on-chain, in SPEC.md §4.2 and in the frozen vectors, and a scheduling
 * inconvenience is not a reason to change consensus.
 */

import { mkdir, readFile, rm } from "node:fs/promises";
import { spawn } from "bun";
import { join } from "node:path";

import { MEMBERSHIP_ACTIVATION_DELAY } from "../src/lib/pixel/membership";
import { loadIdentity } from "../src/node/store";

const ROOT = join(import.meta.dir, "..");
const BASE = `/tmp/pixel-handshake-${process.pid}`;
const RPC = 18900 + (process.pid % 400);
const url = `http://127.0.0.1:${RPC}`;
const incumbentDir = join(BASE, "incumbent");
const joinerDir = join(BASE, "joiner");
const requestFile = join(BASE, "join-request.json");

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

const procs: Array<{ kill: () => void; exited: Promise<number> }> = [];

async function pixel(args: string[], expectOk = true): Promise<string> {
  const p = spawn({
    cmd: ["bun", "src/node/cli.ts", ...args],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(p.stdout).text();
  const err = await new Response(p.stderr).text();
  await p.exited;
  if (expectOk && p.exitCode !== 0) throw new Error(`${args.join(" ")}\n${out}\n${err}`);
  return out + err;
}

async function health(): Promise<Record<string, unknown>> {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${url}/health`);
      if (r.ok) return (await r.json()) as Record<string, unknown>;
    } catch {
      /* retry */
    }
    await Bun.sleep(250);
  }
  throw new Error("health timeout");
}

console.log("═══ OPERATOR HANDSHAKE — two machines, no shared key ═══\n");

try {
  await rm(BASE, { recursive: true, force: true });
  await mkdir(incumbentDir, { recursive: true });
  await mkdir(joinerDir, { recursive: true });

  // ── the incumbent's chain ────────────────────────────────────────────────
  {
    const p = spawn({
      cmd: ["bun", "scripts/lab-forge-datadir.ts", "--datadir", incumbentDir],
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PIXEL_ALLOW_LAB_GENESIS: "1" },
    });
    await p.exited;
    if (p.exitCode !== 0) throw new Error("lab-forge failed");
  }
  const node = spawn({
    cmd: [
      "bun",
      "src/node/cli.ts",
      "node",
      "--datadir",
      incumbentDir,
      "--rpc",
      String(RPC),
      "--gossip",
      "0",
    ],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    // The faucet is env-gated, and it is how this test makes pixels. Without it every
    // request 404s and the tip sits at #0 while the loop cheerfully retries forty times.
    env: { ...process.env, PIXEL_FAUCET: "1" },
  });
  procs.push(node);
  const h = await health();
  const incumbentAddr = String(h.address);
  check(h.ok === true, `incumbent node is up at #${h.tip}`);

  // ── step 1: the joiner gets a copy of the chain ──────────────────────────
  await pixel(["join", "--peer", url, "--datadir", joinerDir]);
  const joinerId = await loadIdentity(joinerDir);
  check(joinerId != null, "the joiner forged its own identity by joining");
  const joinerAddr = joinerId!.address;
  check(joinerAddr !== incumbentAddr, "…which is its own address, not a copy of the incumbent's");

  // ── step 2: the joiner proves possession, on its own machine ─────────────
  await pixel([
    "membership",
    "request",
    "--datadir",
    joinerDir,
    "--peer",
    url,
    "--authorizer",
    incumbentAddr,
    "--out",
    requestFile,
  ]);
  const requestText = await readFile(requestFile, "utf8");
  const request = JSON.parse(requestText) as {
    address: string;
    publicKey: string;
    authorizedBy: string;
    offers: Array<{ includedAt: number; possession: string }>;
  };
  check(request.address === joinerAddr, "the request names the joiner's address");
  check(request.authorizedBy === incumbentAddr, "…and the incumbent as authorizer");
  check(request.offers.length > 1, `it pre-signs a window of ${request.offers.length} heights`);

  // THE property. A request that leaked a secret would make the whole ceremony pointless.
  const joinerSecrets = [joinerId!.seed, joinerId!.secretKey].filter(Boolean) as string[];
  check(joinerSecrets.length > 0, "the joiner does have secret material on disk to leak");
  check(
    joinerSecrets.every((secret) => !requestText.includes(secret)),
    "and NONE of it appears in the request — nothing secret crosses the wire",
  );

  // ── step 3: the incumbent authorises, on its own machine ────────────────
  const authOut = await pixel([
    "membership",
    "authorize",
    "--datadir",
    incumbentDir,
    "--request",
    requestFile,
    "--peer",
    url,
  ]);
  check(authOut.includes(joinerAddr), "the incumbent authorised the joiner");
  const activeAt = Number(authOut.match(/electable from #(\d+)/)?.[1] ?? -1);
  check(activeAt > 0, `and the record says electable from #${activeAt}`);

  // The incumbent never saw the joiner's key, only its request file.
  const incumbentId = await loadIdentity(incumbentDir);
  check(
    incumbentId!.seed !== joinerId!.seed,
    "the two datadirs still hold different keys — neither learned the other's",
  );

  // ── it lands, and the delay is real ──────────────────────────────────────
  // Drive pixels until the activation height. The faucet is idempotent per address — it
  // reports "already funded" and produces nothing — so each iteration funds a *fresh*
  // address. That was the first version's bug: sixty no-ops and a tip that never moved.
  const { generatePixelKeypair } = await import("../src/lib/pixel/scheme");
  let reached = -1;
  for (let i = 0; i < 40; i++) {
    const cur = (await (await fetch(`${url}/health`)).json()) as { tip: number };
    reached = cur.tip;
    if (cur.tip >= activeAt) break;
    const fresh = await generatePixelKeypair("PIX-ML-DSA-65");
    await fetch(`${url}/faucet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: fresh.address, amount: 1 }),
    }).catch(() => {});
    await Bun.sleep(500);
  }
  check(reached >= activeAt, `the chain reached #${reached}, at or past the activation height`);
  const statusOut = await pixel(["membership", "status", "--peer", url]);
  check(
    statusOut.includes(joinerAddr),
    `the joiner is now electable — the ${MEMBERSHIP_ACTIVATION_DELAY}-pixel delay elapsed`,
  );
  check(statusOut.includes(incumbentAddr), "…alongside the incumbent, not instead of it");

  // ── the refusals that keep it honest ────────────────────────────────────
  // A request naming someone else cannot be adopted, because the authorizer is signed.
  const wrongAuth = join(BASE, "wrong-authorizer.json");
  await Bun.write(wrongAuth, JSON.stringify({ ...request, authorizedBy: `pix1${"c".repeat(38)}` }));
  const wrongOut = await pixel(
    ["membership", "authorize", "--datadir", incumbentDir, "--request", wrongAuth, "--peer", url],
    false,
  );
  check(
    /cannot be\s*\n?substituted|names/.test(wrongOut),
    "a request naming a different authorizer is refused, not silently re-pointed",
  );

  // A stale window is refused rather than guessed at.
  const stale = join(BASE, "stale.json");
  await Bun.write(
    stale,
    JSON.stringify({
      ...request,
      offers: [{ includedAt: 0, possession: request.offers[0]!.possession }],
    }),
  );
  const staleOut = await pixel(
    ["membership", "authorize", "--datadir", incumbentDir, "--request", stale, "--peer", url],
    false,
  );
  check(
    /outside this request's window|fresh request/.test(staleOut),
    "an expired window asks for a fresh request — the height is signed, so nothing is adjustable",
  );
} finally {
  for (const p of procs) {
    try {
      p.kill();
      await p.exited;
    } catch {
      /* already gone */
    }
  }
  await rm(BASE, { recursive: true, force: true });
}

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log(
  "═══ PASS — a second operator can be invited without either side holding the other's key ═══",
);

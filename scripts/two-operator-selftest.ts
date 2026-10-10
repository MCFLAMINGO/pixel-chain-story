#!/usr/bin/env bun
/**
 * Two operators, and the chain survives losing one.
 *
 * This is the test the whole soundness pass existed to make possible, and the one the
 * project has never been able to run. Every previous multi-node test made its second
 * sequencer with a single local function call — `registerSequencer(state, bob)` — which
 * was exactly the hole that let a stranger with one ground keypair extend the tip. There
 * was no honest way to add an operator, and so no honest way to test losing one.
 *
 * What this does, end to end, with real processes over real sockets:
 *
 *   1. forge a lab chain, start operator A
 *   2. B joins and syncs
 *   3. **A invites B for real** — a signed join record committed to a pixel, then the
 *      activation delay elapses. No shortcut, no local registration.
 *   4. assert both are electable and both can win the lottery
 *   5. **kill whichever operator the lottery elected** and assert the tip still advances
 *   6. restart the dead one and assert it catches up to the branch it missed
 *
 * Step 5 is the point. "What a single sequencer lacks is liveness and censorship
 * resistance, which is a succession problem, not a consensus one" — that sentence has
 * been the honest summary of this project for months. This is the test that decides
 * whether it is still true.
 */

import { mkdir, rm } from "node:fs/promises";
import { spawn, type Subprocess } from "bun";
import { join } from "node:path";

import { MEMBERSHIP_ACTIVATION_DELAY } from "../src/lib/pixel/membership";
import { loadWallet, saveWallet } from "../src/node/store";
import { deserializeChain, proposeTransfer, type SerializedChain } from "../src/lib/pixel/index";

const ROOT = join(import.meta.dir, "..");
const BASE = `/tmp/pixel-two-op-${process.pid}`;
const RPC_A = 18200 + (process.pid % 500);
const RPC_B = RPC_A + 1;
const GOSSIP_A = 18700 + (process.pid % 500);
const GOSSIP_B = GOSSIP_A + 1;

const dirA = join(BASE, "a");
const dirB = join(BASE, "b");
const urlA = `http://127.0.0.1:${RPC_A}`;
const urlB = `http://127.0.0.1:${RPC_B}`;

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

const procs = new Map<string, Subprocess>();

function startNode(tag: string, datadir: string, rpc: number, gossip: number, seed?: string) {
  const args = [
    "node",
    "--datadir",
    datadir,
    "--rpc",
    String(rpc),
    "--gossip",
    String(gossip),
    "--advertise",
    "127.0.0.1",
  ];
  if (seed) args.push("--seed", seed);
  const proc = spawn({
    cmd: ["bun", "src/node/cli.ts", ...args],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  for (const stream of [proc.stdout, proc.stderr] as const) {
    void (async () => {
      const dec = new TextDecoder();
      for await (const chunk of stream) {
        const line = dec.decode(chunk).trim();
        // Only surface the lines that matter to the story being told.
        if (
          /illuminated|accepted pixel|committed|queued|REORG|skip|sequence failed|reject|refus|malformed|Error/i.test(
            line,
          )
        ) {
          console.log(`    [${tag}] ${line.replace(/^\[pixel-ledger\]\s*/, "")}`);
        }
      }
    })();
  }
  procs.set(tag, proc);
  return proc;
}

async function sh(args: string[], env: Record<string, string> = {}): Promise<string> {
  const p = spawn({
    cmd: ["bun", "src/node/cli.ts", ...args],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  const out = await new Response(p.stdout).text();
  const err = await new Response(p.stderr).text();
  await p.exited;
  if (p.exitCode !== 0) throw new Error(`${args.join(" ")} failed\n${out}\n${err}`);
  return out;
}

async function health(url: string, ms = 30_000): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${url}/health`);
      if (r.ok) return (await r.json()) as Record<string, unknown>;
    } catch {
      /* retry */
    }
    await Bun.sleep(250);
  }
  throw new Error(`health timeout ${url}`);
}

async function tipOf(url: string): Promise<number> {
  const h = (await (await fetch(`${url}/health`)).json()) as { tip: number };
  return h.tip;
}

async function waitTip(url: string, min: number, ms = 60_000): Promise<number> {
  const t0 = Date.now();
  let last = -1;
  while (Date.now() - t0 < ms) {
    try {
      last = await tipOf(url);
      if (last >= min) return last;
    } catch {
      /* retry */
    }
    await Bun.sleep(300);
  }
  throw new Error(`tip timeout at ${url}: wanted >= ${min}, saw ${last}`);
}

/**
 * Push one real transfer so there is something for a producer to seal.
 *
 * Waits for the mempool to drain first. The sequencer wallet has one UTXO chain, so
 * submitting again before the previous transfer is sealed hits `input-reserved` — which
 * is the mempool door working correctly (T1.8) and the harness being impatient.
 */
async function spend(url: string, datadir: string, to: string, amount: number): Promise<boolean> {
  // Retry on `input-reserved` rather than failing. The sequencer wallet spends one UTXO
  // chain, and once BOTH operators are live either of them may seal — so a transfer built
  // against a moment-old view can find its input already promised. That is the T1.8
  // mempool door working exactly as designed; the harness just has to be patient. Waiting
  // on one node's `pending` count is not sufficient, because the other node's mempool is
  // where the reservation may live.
  for (let attempt = 0; attempt < 25; attempt++) {
    const seq = await loadWallet(datadir, "sequencer");
    if (!seq) throw new Error("no sequencer wallet");
    const sync = (await (await fetch(`${url}/sync`)).json()) as SerializedChain;
    const live = deserializeChain({ ...sync, utxos: [] });
    let tx;
    try {
      ({ tx } = await proposeTransfer(live, seq, [{ amount, address: to }], {
        description: "two-operator",
      }));
    } catch {
      await Bun.sleep(500);
      continue;
    }
    await saveWallet(datadir, "sequencer", seq);
    const res = await fetch(`${url}/tx`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tx),
    });
    if (res.ok) return true;
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    // `unknown-input` joins the retry list: it means a block sealed between reading /sync
    // and submitting, so the input this transfer was built against is already spent. The
    // world moved, which is the normal condition with two live producers — not an error.
    if (
      body.code === "input-reserved" ||
      body.code === "duplicate" ||
      body.code === "unknown-input"
    ) {
      await Bun.sleep(600);
      continue;
    }
    throw new Error(`tx refused: ${JSON.stringify(body)}`);
  }
  return false;
}

async function electableAtTip(url: string): Promise<string[]> {
  const sync = (await (await fetch(`${url}/sync`)).json()) as {
    pixels: Array<{ lightProof: { electable?: string[] } }>;
  };
  const tip = sync.pixels[sync.pixels.length - 1];
  return tip?.lightProof.electable ?? [];
}

async function producerOf(url: string, index: number): Promise<string> {
  const sync = (await (await fetch(`${url}/sync`)).json()) as {
    pixels: Array<{ index: number; lightProof: { sequencerAddress: string; skipCount?: number } }>;
  };
  return sync.pixels[index]?.lightProof.sequencerAddress ?? "";
}

console.log("═══ TWO OPERATORS — the chain survives losing one ═══\n");

try {
  await rm(BASE, { recursive: true, force: true });
  await mkdir(dirA, { recursive: true });
  await mkdir(dirB, { recursive: true });

  // ── 1. operator A ────────────────────────────────────────────────────────
  {
    const p = spawn({
      cmd: ["bun", "scripts/lab-forge-datadir.ts", "--datadir", dirA],
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PIXEL_ALLOW_LAB_GENESIS: "1" },
    });
    await p.exited;
    if (p.exitCode !== 0) throw new Error("lab-forge failed");
  }
  await sh(["wallet", "from-node", "sequencer", "--datadir", dirA]);
  const bobOut = await sh(["wallet", "create", "bob", "--datadir", dirA]);
  const bob = bobOut.match(/address:\s*(pix1[a-f0-9]+)/)?.[1];
  if (!bob) throw new Error("no bob address");

  startNode("A", dirA, RPC_A, GOSSIP_A);
  const hA = await health(urlA);
  const addrA = String(hA.address);
  check(hA.ok === true, `operator A is up at #${hA.tip}`);

  // ── 2. B joins and syncs ─────────────────────────────────────────────────
  await sh(["join", "--peer", urlA, "--datadir", dirB]);
  startNode("B", dirB, RPC_B, GOSSIP_B, `ws://127.0.0.1:${GOSSIP_A}/gossip`);
  const hB = await health(urlB);
  const addrB = String(hB.address);
  check(addrA !== addrB, "A and B are distinct identities");
  check(
    (await electableAtTip(urlA)).length === 1,
    "only A is electable — B joining grants nothing",
  );

  // ── 3. the real invitation ───────────────────────────────────────────────
  const inviteOut = await sh([
    "membership",
    "invite",
    "--datadir",
    dirA,
    "--joiner-datadir",
    dirB,
    "--peer",
    urlA,
  ]);
  const activeAt = Number(inviteOut.match(/electable from #(\d+)/)?.[1] ?? -1);
  check(inviteOut.includes(addrB), `A invited B (${addrB.slice(0, 14)}…)`);
  check(activeAt > 0, `record says B is electable from #${activeAt}`);

  // Drive pixels until the record is committed and the delay has elapsed.
  let guard = 0;
  while ((await tipOf(urlA)) < activeAt && guard < 40) {
    await spend(urlA, dirA, bob, 1);
    await Bun.sleep(700);
    guard++;
  }
  const tipAfterDelay = await waitTip(urlA, activeAt);
  check(tipAfterDelay >= activeAt, `chain reached #${tipAfterDelay}, past the activation height`);

  const electable = await electableAtTip(urlA);
  check(electable.length === 2, `two operators are electable (${electable.length})`);
  check(
    electable.includes(addrA) && electable.includes(addrB),
    "and they are exactly A and B — folded from a committed record, not from gossip",
  );
  check(
    (await electableAtTip(urlB)).join("|") === electable.join("|"),
    "B computes the identical set from the same history",
  );

  // ── 4. both actually produce ─────────────────────────────────────────────
  const beforeShare = await tipOf(urlA);
  for (let i = 0; i < 8; i++) {
    await spend(urlA, dirA, bob, 1);
    await Bun.sleep(900);
  }
  const afterShare = await waitTip(urlA, beforeShare + 3);
  const producers = new Set<string>();
  for (let i = beforeShare + 1; i <= afterShare; i++) producers.add(await producerOf(urlA, i));
  console.log(
    `    (pixels #${beforeShare + 1}..#${afterShare} produced by ${producers.size} operator(s))`,
  );
  check(producers.size === 2, `both operators produced pixels (${producers.size} distinct)`);
  check(
    (await tipOf(urlA)) === (await tipOf(urlB)),
    `both nodes agree on the tip (#${await tipOf(urlA)})`,
  );

  // ── 5. kill the elected producer ─────────────────────────────────────────
  // The one that matters. Whichever operator the lottery is about to pick, remove it.
  const nextProducerIsA = (await producerOf(urlA, await tipOf(urlA))) === addrA;
  const victimTag = nextProducerIsA ? "A" : "B";
  const survivorUrl = nextProducerIsA ? urlB : urlA;
  const survivorDir = nextProducerIsA ? dirB : dirA;
  const victimProc = procs.get(victimTag)!;
  const tipBeforeKill = await tipOf(survivorUrl);

  console.log(
    `\n  ── killing operator ${victimTag} (pid ${victimProc.pid}) at #${tipBeforeKill} ──`,
  );
  victimProc.kill();
  await victimProc.exited;
  procs.delete(victimTag);
  check(true, `operator ${victimTag} is dead`);

  // The survivor must keep the tip moving. It has to wait out the stall window and
  // produce on a skip when the lottery picks the corpse — that is the Gate C path,
  // exercised here against a process that genuinely is not coming back on its own.
  await sh(["wallet", "from-node", "sequencer", "--datadir", survivorDir]).catch(() => "");
  for (let i = 0; i < 10; i++) {
    await spend(survivorUrl, survivorDir, bob, 1).catch(() => false);
    await Bun.sleep(1200);
    if ((await tipOf(survivorUrl)) > tipBeforeKill + 1) break;
  }
  const tipAfterKill = await waitTip(survivorUrl, tipBeforeKill + 2, 90_000);
  check(
    tipAfterKill > tipBeforeKill + 1,
    `the survivor advanced the tip from #${tipBeforeKill} to #${tipAfterKill} with one operator dead`,
  );

  // ── 6. the dead operator comes back and catches up ──────────────────────
  console.log(`\n  ── restarting operator ${victimTag} ──`);
  startNode(
    victimTag,
    victimTag === "A" ? dirA : dirB,
    victimTag === "A" ? RPC_A : RPC_B,
    victimTag === "A" ? GOSSIP_A : GOSSIP_B,
    victimTag === "A" ? `ws://127.0.0.1:${GOSSIP_B}/gossip` : `ws://127.0.0.1:${GOSSIP_A}/gossip`,
  );
  const revivedUrl = victimTag === "A" ? urlA : urlB;
  await health(revivedUrl);
  const caughtUp = await waitTip(revivedUrl, tipAfterKill, 90_000);
  check(
    caughtUp >= tipAfterKill,
    `the restarted operator caught up to #${caughtUp}, the branch it missed`,
  );
  check(
    (await tipOf(urlA)) === (await tipOf(urlB)),
    `both nodes agree again (#${await tipOf(urlA)})`,
  );

  const finalA = (await (await fetch(`${urlA}/sync`)).json()) as { tipHash: string };
  const finalB = (await (await fetch(`${urlB}/sync`)).json()) as { tipHash: string };
  check(finalA.tipHash === finalB.tipHash, "and on the identical tip hash — one history, not two");
} finally {
  for (const [tag, proc] of procs) {
    try {
      proc.kill();
      await proc.exited;
    } catch {
      console.error(`could not stop ${tag}`);
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
  `═══ PASS — succession works: invited by record, ${MEMBERSHIP_ACTIVATION_DELAY}-pixel delay, ` +
    `one dies, the tip survives ═══`,
);

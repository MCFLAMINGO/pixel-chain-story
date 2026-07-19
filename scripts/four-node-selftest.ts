/**
 * Four-node lab mesh — tip extension under leader lottery.
 * bun scripts/four-node-selftest.ts
 *
 * Honesty: permissioned sequencers + hash lottery, not BFT / not public mainnet.
 */
import { rm, mkdir } from "node:fs/promises";
import { spawn, type Subprocess } from "bun";
import { join } from "node:path";
import { deserializeChain, proposeTransfer, type SerializedChain } from "../src/lib/pixel/index";
import { loadWallet, saveWallet } from "../src/node/store";

const ROOT = join(import.meta.dir, "..");
const BASE = `/tmp/pixel-four-node-${process.pid}`;
const N = 4;
const RPC0 = 17000 + (process.pid % 800);
const GOSSIP0 = 16000 + (process.pid % 800);

function dir(i: number) {
  return join(BASE, `n${i}`);
}
function rpc(i: number) {
  return RPC0 + i;
}
function gossip(i: number) {
  return GOSSIP0 + i;
}

async function waitHealth(url: string, ms = 25_000): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${url}/health`);
      if (r.ok) return (await r.json()) as Record<string, unknown>;
    } catch {
      /* retry */
    }
    await Bun.sleep(200);
  }
  throw new Error(`health timeout ${url}`);
}

async function waitTipAll(urls: string[], minPixels: number, ms = 60_000): Promise<number[]> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const tips = await Promise.all(
        urls.map(async (u) => {
          const h = (await (await fetch(`${u}/health`)).json()) as { pixels: number };
          return h.pixels;
        }),
      );
      if (tips.every((p) => p >= minPixels)) return tips;
    } catch {
      /* retry */
    }
    await Bun.sleep(300);
  }
  throw new Error(`tip timeout want ≥${minPixels} on all ${urls.length} nodes`);
}

function runPixel(args: string[], tag: string): Subprocess {
  const proc = spawn({
    cmd: ["bun", "src/node/cli.ts", ...args],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  void (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stdout) {
      const line = dec.decode(chunk).trim();
      if (line) console.log(`[${tag}]`, line);
    }
  })();
  void (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stderr) {
      const line = dec.decode(chunk).trim();
      if (line) console.error(`[${tag}!]`, line);
    }
  })();
  return proc;
}

async function sh(args: string[]): Promise<string> {
  const p = spawn({
    cmd: ["bun", "src/node/cli.ts", ...args],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(p.stdout).text();
  const err = await new Response(p.stderr).text();
  await p.exited;
  if (p.exitCode !== 0) throw new Error(`${args.join(" ")}\n${out}\n${err}`);
  return out;
}

async function main() {
  console.log("═══ FOUR-NODE LAB MESH ═══\n");
  await rm(BASE, { recursive: true, force: true });
  for (let i = 0; i < N; i++) await mkdir(dir(i), { recursive: true });

  await sh(["init", "--datadir", dir(0)]);
  await sh(["wallet", "from-node", "sequencer", "--datadir", dir(0)]);
  const bobOut = await sh(["wallet", "create", "bob", "--datadir", dir(0)]);
  const bobAddr = bobOut.match(/address:\s*(pix1[a-f0-9]+)/)?.[1];
  if (!bobAddr) throw new Error("bob missing");

  const procs: Subprocess[] = [];
  // Start genesis node
  procs.push(
    runPixel(
      [
        "node",
        "--datadir",
        dir(0),
        "--rpc",
        String(rpc(0)),
        "--gossip",
        String(gossip(0)),
        "--advertise",
        "127.0.0.1",
      ],
      "n0",
    ),
  );
  await waitHealth(`http://127.0.0.1:${rpc(0)}`);
  await sh(["wallet", "from-node", "sequencer", "--datadir", dir(0)]);

  // Join + start peers 1..3 seeded to n0
  for (let i = 1; i < N; i++) {
    await sh(["join", "--peer", `http://127.0.0.1:${rpc(0)}`, "--datadir", dir(i)]);
    procs.push(
      runPixel(
        [
          "node",
          "--datadir",
          dir(i),
          "--rpc",
          String(rpc(i)),
          "--gossip",
          String(gossip(i)),
          "--seed",
          `ws://127.0.0.1:${gossip(0)}/gossip`,
          "--advertise",
          "127.0.0.1",
        ],
        `n${i}`,
      ),
    );
    await waitHealth(`http://127.0.0.1:${rpc(i)}`);
  }
  await Bun.sleep(2000);

  const urls = Array.from({ length: N }, (_, i) => `http://127.0.0.1:${rpc(i)}`);
  const peers = await Promise.all(
    urls.map(async (u) => ((await (await fetch(`${u}/health`)).json()) as { peers: number }).peers),
  );
  console.log("▸ peer counts", peers);
  if (peers.every((p) => p < 1)) throw new Error("mesh not linked");

  const seq = await loadWallet(dir(0), "sequencer");
  if (!seq) throw new Error("sequencer wallet");
  const sync = (await (await fetch(`${urls[0]}/sync`)).json()) as SerializedChain;
  let live = deserializeChain({ ...sync, utxos: [] });
  const { tx } = await proposeTransfer(live, seq, [{ amount: 5, address: bobAddr }], {
    description: "four-node-1",
  });
  await saveWallet(dir(0), "sequencer", seq);
  await fetch(`${urls[0]}/tx`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tx),
  });

  const tips1 = await waitTipAll(urls, 2);
  console.log("▸ tips after tx1", tips1);

  live = deserializeChain((await (await fetch(`${urls[0]}/sync`)).json()) as SerializedChain);
  const again = await loadWallet(dir(0), "sequencer");
  if (!again) throw new Error("reload");
  const { tx: tx2 } = await proposeTransfer(live, again, [{ amount: 2, address: bobAddr }], {
    description: "four-node-2",
  });
  await saveWallet(dir(0), "sequencer", again);
  // Submit via a non-genesis node — lottery may elect any of the four
  await fetch(`${urls[2]}/tx`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tx2),
  });

  const tips2 = await waitTipAll(urls, 3);
  console.log("▸ tips after tx2", tips2);
  if (new Set(tips2).size !== 1) throw new Error("tip disagreement");

  const bal = (await (await fetch(`${urls[3]}/balance/${bobAddr}`)).json()) as {
    balance: number;
  };
  if (bal.balance !== 7) throw new Error(`bob want 7 got ${bal.balance}`);
  console.log("▸ bob=7 on n3 ✓");

  console.log("\n═══ PASS — 4-node lab mesh tip extension ═══");
  for (const p of procs) p.kill();
  await Promise.allSettled(procs.map((p) => p.exited));
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

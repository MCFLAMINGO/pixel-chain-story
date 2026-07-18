/**
 * Gate B — two real processes, gossip join, live tip sync.
 * bun scripts/net-selftest.ts
 */

import { rm, mkdir } from "node:fs/promises";
import { spawn, type Subprocess } from "bun";
import { join } from "node:path";
import { deserializeChain, proposeTransfer, type SerializedChain } from "../src/lib/pixel/index";
import { loadWallet, saveWallet } from "../src/node/store";

const ROOT = join(import.meta.dir, "..");
// PID-scoped so parallel CI jobs (push + PR) cannot share one /tmp tree.
const BASE = `/tmp/pixel-gate-b-net-${process.pid}`;
const A = join(BASE, "a");
const B = join(BASE, "b");

async function waitHealth(url: string, ms = 20_000): Promise<Record<string, unknown>> {
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

async function waitTip(url: string, minPixels: number, ms = 45_000): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const h = (await (await fetch(`${url}/health`)).json()) as { pixels: number };
      if (h.pixels >= minPixels) return h.pixels;
    } catch {
      /* retry */
    }
    await Bun.sleep(250);
  }
  throw new Error(`tip timeout want ≥${minPixels} at ${url}`);
}

function runPixel(args: string[], logTag: string): Subprocess {
  const proc = spawn({
    cmd: ["bun", "src/node/cli.ts", ...args],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  void (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stdout) {
      const line = dec.decode(chunk);
      if (line.trim()) console.log(`[${logTag}]`, line.trimEnd());
    }
  })();
  void (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stderr) {
      const line = dec.decode(chunk);
      if (line.trim()) console.error(`[${logTag}!]`, line.trimEnd());
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
  console.log("═══ GATE B — TWO-NODE NETWORK ═══\n");
  await rm(BASE, { recursive: true, force: true });
  await mkdir(A, { recursive: true });
  await mkdir(B, { recursive: true });

  await sh(["init", "--datadir", A]);
  await sh(["wallet", "from-node", "sequencer", "--datadir", A]);
  const bobOut = await sh(["wallet", "create", "bob", "--datadir", A]);
  const bobAddr = bobOut.match(/address:\s*(pix1[a-f0-9]+)/)?.[1];
  if (!bobAddr) throw new Error(`bob address missing: ${bobOut}`);
  console.log("▸ bob", bobAddr.slice(0, 16) + "…");

  const nodeA = runPixel(
    ["node", "--datadir", A, "--rpc", "18545", "--gossip", "19001", "--advertise", "127.0.0.1"],
    "A",
  );
  const healthA = await waitHealth("http://127.0.0.1:18545");
  console.log("▸ node A up pixels=", healthA.pixels, "gossip=", healthA.gossipUrl);

  await sh(["join", "--peer", "http://127.0.0.1:18545", "--datadir", B]);
  console.log("▸ join B via /sync ✓");

  const nodeB = runPixel(
    [
      "node",
      "--datadir",
      B,
      "--rpc",
      "18546",
      "--gossip",
      "19002",
      "--seed",
      "ws://127.0.0.1:19001/gossip",
      "--advertise",
      "127.0.0.1",
    ],
    "B",
  );
  await waitHealth("http://127.0.0.1:18546");
  await Bun.sleep(1500);

  const ha = (await (await fetch("http://127.0.0.1:18545/health")).json()) as { peers: number };
  const hb = (await (await fetch("http://127.0.0.1:18546/health")).json()) as { peers: number };
  console.log(`▸ peers A=${ha.peers} B=${hb.peers}`);
  if (ha.peers < 1 && hb.peers < 1) throw new Error("no gossip peers linked");

  // Live submit: build tx, POST /tx to A — B must learn via gossip
  const seq = await loadWallet(A, "sequencer");
  if (!seq) throw new Error("sequencer wallet missing");
  const sync = (await (await fetch("http://127.0.0.1:18545/sync")).json()) as SerializedChain & {
    sequencers: { address: string; publicKey: string }[];
  };
  let live = deserializeChain({
    networkId: sync.networkId,
    pixels: sync.pixels,
    utxos: [],
    pending: [],
    sequencers: sync.sequencers,
  });
  const { tx } = await proposeTransfer(live, seq, [{ amount: 7, address: bobAddr }], {
    description: "gate-b live",
    recipientLabel: "@bob",
  });
  await saveWallet(A, "sequencer", seq);
  const submitted = await fetch("http://127.0.0.1:18545/tx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tx),
  }).then((r) => r.json());
  console.log("▸ POST /tx → A", submitted);

  const tipA = await waitTip("http://127.0.0.1:18545", 2);
  const tipB = await waitTip("http://127.0.0.1:18546", 2);
  console.log(`▸ live tips A=${tipA} B=${tipB}`);
  if (tipA !== tipB) throw new Error(`tip mismatch A=${tipA} B=${tipB}`);

  const balB = (await (await fetch(`http://127.0.0.1:18546/balance/${bobAddr}`)).json()) as {
    balance: number;
  };
  if (balB.balance !== 7) throw new Error(`bob on B want 7 got ${balB.balance}`);
  console.log("▸ bob balance on B = 7 ✓");

  // Second live transfer via B's RPC — A illuminates, both tips advance (B→A gossip)
  live = deserializeChain(
    (await (await fetch("http://127.0.0.1:18545/sync")).json()) as SerializedChain,
  );
  const again = await loadWallet(A, "sequencer");
  if (!again) throw new Error("reload sequencer");
  const { tx: tx2 } = await proposeTransfer(live, again, [{ amount: 3, address: bobAddr }], {
    description: "gate-b-2",
    recipientLabel: "@bob",
  });
  await saveWallet(A, "sequencer", again);
  const submitted2 = await fetch("http://127.0.0.1:18546/tx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tx2),
  }).then((r) => r.json());
  console.log("▸ POST /tx → B (gossip to A)", submitted2);

  const tipA2 = await waitTip("http://127.0.0.1:18545", 3);
  const tipB2 = await waitTip("http://127.0.0.1:18546", 3);
  console.log(`▸ second live tips A=${tipA2} B=${tipB2}`);
  if (tipA2 !== tipB2) throw new Error("second tip mismatch");

  const bal2 = (await (await fetch(`http://127.0.0.1:18546/balance/${bobAddr}`)).json()) as {
    balance: number;
  };
  if (bal2.balance !== 10) throw new Error(`bob want 10 got ${bal2.balance}`);
  console.log("▸ bob balance on B = 10 ✓");

  console.log("\n═══ PASS — Gate B two-node live gossip network ═══");
  nodeA.kill();
  nodeB.kill();
  await Promise.allSettled([nodeA.exited, nodeB.exited]);
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

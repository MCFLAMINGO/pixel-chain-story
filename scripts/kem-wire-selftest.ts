/**
 * Opt-in ML-KEM gossip wire — two nodes with PIXEL_TRANSPORT_KEM=1.
 * bun scripts/kem-wire-selftest.ts
 */
import { rm, mkdir } from "node:fs/promises";
import { spawn, type Subprocess } from "bun";
import { join } from "node:path";
import { deserializeChain, proposeTransfer, type SerializedChain } from "../src/lib/pixel/index";
import { loadWallet, saveWallet } from "../src/node/store";

const ROOT = join(import.meta.dir, "..");
const BASE = `/tmp/pixel-kem-wire-${process.pid}`;
const A = join(BASE, "a");
const B = join(BASE, "b");
const RPC_A = 16000 + (process.pid % 1000);
const RPC_B = RPC_A + 1;
const GOSSIP_A = 17000 + (process.pid % 1000);
const GOSSIP_B = GOSSIP_A + 1;

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
    env: { ...process.env, PIXEL_TRANSPORT_KEM: "1" },
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
    env: { ...process.env, PIXEL_TRANSPORT_KEM: "1" },
  });
  const out = await new Response(p.stdout).text();
  const err = await new Response(p.stderr).text();
  await p.exited;
  if (p.exitCode !== 0) throw new Error(`${args.join(" ")}\n${out}\n${err}`);
  return out;
}

async function main() {
  console.log("═══ ML-KEM WIRE (PIXEL_TRANSPORT_KEM=1) ═══\n");
  await rm(BASE, { recursive: true, force: true });
  await mkdir(A, { recursive: true });
  await mkdir(B, { recursive: true });

  await sh(["init", "--datadir", A]);
  await sh(["wallet", "from-node", "sequencer", "--datadir", A]);
  const bobOut = await sh(["wallet", "create", "bob", "--datadir", A]);
  const bobAddr = bobOut.match(/address:\s*(pix1[a-f0-9]+)/)?.[1];
  if (!bobAddr) throw new Error(`bob address missing: ${bobOut}`);

  const nodeA = runPixel(
    [
      "node",
      "--datadir",
      A,
      "--rpc",
      String(RPC_A),
      "--gossip",
      String(GOSSIP_A),
      "--advertise",
      "127.0.0.1",
    ],
    "A",
  );
  const healthA = await waitHealth(`http://127.0.0.1:${RPC_A}`);
  const transportA = healthA.transport as { enabled?: boolean; kemPublicKey?: string } | undefined;
  if (!transportA?.enabled || !transportA.kemPublicKey) {
    throw new Error("node A transport not enabled in /health");
  }
  console.log("▸ A transport ML-KEM enabled ✓", String(transportA.kemPublicKey).slice(0, 16) + "…");

  await sh(["wallet", "from-node", "sequencer", "--datadir", A]);
  await sh(["join", "--peer", `http://127.0.0.1:${RPC_A}`, "--datadir", B]);

  const nodeB = runPixel(
    [
      "node",
      "--datadir",
      B,
      "--rpc",
      String(RPC_B),
      "--gossip",
      String(GOSSIP_B),
      "--seed",
      `ws://127.0.0.1:${GOSSIP_A}/gossip`,
      "--advertise",
      "127.0.0.1",
    ],
    "B",
  );
  const healthB = await waitHealth(`http://127.0.0.1:${RPC_B}`);
  if (!(healthB.transport as { enabled?: boolean })?.enabled) {
    throw new Error("node B transport not enabled");
  }
  await Bun.sleep(2000);

  const seq = await loadWallet(A, "sequencer");
  if (!seq) throw new Error("sequencer wallet missing");
  const sync = (await (await fetch(`http://127.0.0.1:${RPC_A}/sync`)).json()) as SerializedChain & {
    sequencers: { address: string; publicKey: string }[];
  };
  const live = deserializeChain({
    networkId: sync.networkId,
    pixels: sync.pixels,
    utxos: [],
    pending: [],
    sequencers: sync.sequencers,
  });
  const { tx } = await proposeTransfer(live, seq, [{ amount: 7, address: bobAddr }], {
    description: "kem-wire",
    recipientLabel: "@bob",
  });
  await saveWallet(A, "sequencer", seq);
  await fetch(`http://127.0.0.1:${RPC_A}/tx`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tx),
  });

  const tipA = await waitTip(`http://127.0.0.1:${RPC_A}`, 2);
  const tipB = await waitTip(`http://127.0.0.1:${RPC_B}`, 2);
  console.log(`▸ sealed-gossip tips A=${tipA} B=${tipB}`);
  if (tipA !== tipB) throw new Error(`tip mismatch A=${tipA} B=${tipB}`);

  const balB = (await (await fetch(`http://127.0.0.1:${RPC_B}/balance/${bobAddr}`)).json()) as {
    balance: number;
  };
  if (balB.balance !== 7) throw new Error(`bob on B want 7 got ${balB.balance}`);
  console.log("▸ bob=7 on B via sealed gossip ✓");

  console.log("\n═══ PASS — opt-in ML-KEM wire tip sync ═══");
  nodeA.kill();
  nodeB.kill();
  await Promise.allSettled([nodeA.exited, nodeB.exited]);
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

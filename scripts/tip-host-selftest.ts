/**
 * Canonical tip host contract — durable feed for production `/`.
 * Starts tip:host briefly; restart keeps the same Earth.
 * bun run test:tip-host
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { assertTipHealth, createGenesis, probeTipHost, tipHostThesis } from "../src/lib/pixel";
import { PixelLedgerNode } from "../src/node/node";
import { startRpcServer } from "../src/node/rpc-server";
import { loadChain, loadOrCreateIdentity, saveChain } from "../src/node/store";

const BASE = `/tmp/pixel-tip-host-${process.pid}`;
const RPC = 19_600 + (process.pid % 300);
const GOSSIP = 0;

async function bootTip(datadir: string): Promise<{
  node: PixelLedgerNode;
  server: ReturnType<typeof startRpcServer>;
}> {
  await mkdir(datadir, { recursive: true });
  const existing = await loadChain(datadir);
  if (!existing) {
    const { keypair } = await loadOrCreateIdentity(datadir, "genesis");
    const chain = await createGenesis(keypair);
    await saveChain(datadir, chain);
  }
  const node = new PixelLedgerNode({
    datadir,
    rpcPort: RPC,
    gossipPort: GOSSIP,
    autoSequenceMs: 0,
    stallCheckMs: 0,
    label: "tip-host-selftest",
  });
  await node.start();
  const server = startRpcServer(node, RPC);
  return { node, server };
}

async function main() {
  console.log("═══ CANONICAL TIP HOST ═══\n");
  if (!tipHostThesis().includes("VITE_PIXEL_RPC")) throw new Error("thesis");
  if (!/Dream ≠ humanity mainnet/i.test(tipHostThesis())) throw new Error("thesis invent");
  console.log("▸ thesis ✓");

  await rm(BASE, { recursive: true, force: true });
  const datadir = join(BASE, "data");

  let firstGenesis = "";
  {
    const { node, server } = await bootTip(datadir);
    try {
      const base = `http://127.0.0.1:${RPC}`;
      // wait for listen
      await Bun.sleep(80);
      const probe = await probeTipHost(base);
      if (!probe.ok) throw new Error(`probe: ${probe.reason}`);
      firstGenesis = probe.genesisHash!;
      console.log("▸ tip probe ✓ canvas", probe.canvasId, "tip", probe.tip);

      const health = (await fetch(`${base}/health`).then((r) => r.json())) as {
        ok?: boolean;
        genesisHash?: string;
        canvasId?: string;
        networkId?: number;
        tip?: number;
      };
      const h = assertTipHealth(health);
      if (!h.ok) throw new Error(h.reason);
      console.log("▸ /health contract ✓");

      // Bad health rejected
      const bad = assertTipHealth({ ok: true, genesisHash: "short" });
      if (bad.ok) throw new Error("short genesis should fail");
      console.log("▸ forge health rejected ✓");
    } finally {
      server.stop(true);
      node.stop();
      await Bun.sleep(150);
    }
  }

  // Restart same datadir — same Earth
  {
    const { node, server } = await bootTip(datadir);
    try {
      await Bun.sleep(80);
      const probe = await probeTipHost(`http://127.0.0.1:${RPC}`);
      if (!probe.ok) throw new Error(`reprobe: ${probe.reason}`);
      if (probe.genesisHash !== firstGenesis) {
        throw new Error("genesisHash drifted after restart — new Earth");
      }
      console.log("▸ restart keeps genesisHash ✓", firstGenesis.slice(0, 16) + "…");
    } finally {
      server.stop(true);
      node.stop();
      await Bun.sleep(150);
    }
  }

  await rm(BASE, { recursive: true, force: true }).catch(() => {});
  console.log("\n═══ PASS — tip host contract (lab) ═══");
  console.log(
    "Production default still needs a durable public URL + VITE_PIXEL_RPC — see docs/CANONICAL-TIP.md",
  );
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

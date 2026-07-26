/**
 * Tip faucet for new pay faces.
 * bun run test:faucet
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createGenesis, generatePixelKeypair } from "../src/lib/pixel/index";
import { PixelLedgerNode } from "../src/node/node";
import { startRpcServer } from "../src/node/rpc-server";
import { loadOrCreateIdentity, saveChain } from "../src/node/store";

const BASE = `/tmp/pixel-faucet-${process.pid}`;
const RPC = 19_200 + (process.pid % 400);

async function main() {
  console.log("═══ TIP FAUCET ═══\n");
  process.env.PIXEL_FAUCET = "1";
  process.env.PIXEL_BRIDGE_LAB = "1";
  process.env.PIXEL_TIP_HOST = "1";

  await rm(BASE, { recursive: true, force: true });
  await mkdir(BASE, { recursive: true });
  const { keypair } = await loadOrCreateIdentity(BASE, "tip");
  await saveChain(BASE, await createGenesis(keypair));

  const node = new PixelLedgerNode({
    datadir: BASE,
    rpcPort: RPC,
    gossipPort: 0,
    autoSequenceMs: 0,
    stallCheckMs: 0,
  });
  await node.start();
  const server = startRpcServer(node, RPC);
  await Bun.sleep(80);
  const base = `http://127.0.0.1:${RPC}`;

  const health = (await fetch(`${base}/health`).then((r) => r.json())) as {
    faucet?: boolean;
    bridgeLab?: boolean;
  };
  if (!health.faucet || !health.bridgeLab) throw new Error("health flags");
  console.log("▸ health faucet+bridgeLab ✓");

  const you = await generatePixelKeypair();
  const r1 = (await fetch(`${base}/faucet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: you.address, amount: 10 }),
  }).then((r) => r.json())) as {
    ok?: boolean;
    balance?: number;
    funded?: number;
    skipped?: boolean;
  };
  if (!r1.ok || r1.balance !== 10 || r1.funded !== 10) throw new Error(JSON.stringify(r1));
  console.log("▸ faucet 10 PIX ✓");

  const r2 = (await fetch(`${base}/faucet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: you.address, amount: 10 }),
  }).then((r) => r.json())) as { ok?: boolean; skipped?: boolean; balance?: number };
  if (!r2.ok || !r2.skipped || r2.balance !== 10) throw new Error("skip expected");
  console.log("▸ second faucet skipped ✓");

  const bridge = (await fetch(`${base}/bridge/shine-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      asset: "USDC",
      humanUsd: 5,
      ownerAddress: you.address,
      ownerLocalId: "friend",
    }),
  }).then((r) => r.json())) as { ok?: boolean; pixCredited?: number; plane?: string };
  if (!bridge.ok || bridge.pixCredited !== 5 || bridge.plane !== "shared_tip") {
    throw new Error(JSON.stringify(bridge));
  }
  console.log("▸ tip bridge USDC → shared_tip ✓");

  server.stop(true);
  node.stop();
  console.log("\n═══ PASS — tip faucet + bridge ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

#!/usr/bin/env bun
/**
 * Always-on canonical tip host — production / Railway / VPS entrypoint.
 *
 * Env:
 *   PORT | PIXEL_RPC_PORT   — HTTP RPC (default 8545). Railway injects PORT.
 *   PIXEL_DATADIR           — persistent chain + keys (default ./data/canonical)
 *   PIXEL_GOSSIP_PORT       — optional mesh listen (default 9001, not public on Railway)
 *   PIXEL_ADVERTISE_HOST    — gossip advertise host when multi-operator
 *   CONTINUITY_WEBHOOK_SECRET — optional Continuity order webhook
 *
 * First boot inits genesis into PIXEL_DATADIR. Keep the volume — lose it = new Earth.
 *
 *   bun scripts/run-canonical-tip.ts
 *   docker run -p 8545:8545 -v pixel-tip:/data/pixel …
 *
 * Then point the site: VITE_PIXEL_RPC=https://your-tip-host
 * See docs/CANONICAL-TIP.md
 */

import { mkdir } from "node:fs/promises";
import { createGenesis } from "../src/lib/pixel/index";
import { PixelLedgerNode } from "../src/node/node";
import { startRpcServer } from "../src/node/rpc-server";
import { loadChain, loadOrCreateIdentity, saveChain } from "../src/node/store";

const datadir = process.env.PIXEL_DATADIR?.trim() || "./data/canonical";
const rpcPort = Number(process.env.PORT || process.env.PIXEL_RPC_PORT || "8545");
const gossipPort = Number(process.env.PIXEL_GOSSIP_PORT || "9001");
const advertise = process.env.PIXEL_ADVERTISE_HOST?.trim() || undefined;

async function main() {
  if (!Number.isFinite(rpcPort) || rpcPort <= 0) {
    throw new Error(`Bad PORT / PIXEL_RPC_PORT: ${process.env.PORT ?? process.env.PIXEL_RPC_PORT}`);
  }

  await mkdir(datadir, { recursive: true });

  // Tip host may forge ceremony genesis once — people never CLI-init.
  process.env.PIXEL_TIP_HOST = process.env.PIXEL_TIP_HOST || "1";

  const existing = await loadChain(datadir);
  if (!existing) {
    // Forging here creates a NEW Earth, not a copy of the crowned one. The script
    // name reads like "run the tip", so a friend who clones the repo and tries it
    // would quietly become their own network and wonder why nobody else is on it.
    // A ceremony is a deliberate act and has to be asked for out loud.
    const ceremony =
      process.env.PIXEL_GENESIS_CEREMONY === "1" || process.env.PIXEL_GENESIS_CEREMONY === "true";
    if (!ceremony) {
      console.error(
        [
          `No ledger in ${datadir}, and this would forge a NEW Earth — not a copy of`,
          "the crowned one. Almost nobody wants that.",
          "",
          "To follow the existing tip instead (this is probably what you want):",
          "  PEER=https://pixel-tip-production.up.railway.app",
          "  bun run pixel -- join --peer $PEER --datadir ./data/friend --require-crowned",
          "  bun run pixel -- node --datadir ./data/friend --rpc 8546 --gossip 9002",
          "",
          "If you really are starting a separate network of your own:",
          "  PIXEL_GENESIS_CEREMONY=1 bun run tip:host",
        ].join("\n"),
      );
      process.exit(1);
    }
    const { keypair } = await loadOrCreateIdentity(datadir, "genesis");
    // Never the crowned network. That genesis exists and cannot be made twice:
    // a new ceremony produces a different hash, which node startup now refuses.
    // Forging here would only ever build a chain nothing will run. A ceremony
    // starts a *separate* network, and says so.
    const chain = await createGenesis(keypair);
    await saveChain(datadir, chain);
    console.log(
      `[canonical-tip] NEW network ${chain.networkId} · genesis ${chain.pixels[0]!.hash.slice(0, 24)}…`,
    );
    console.log("[canonical-tip] this is not the crowned Earth and never can be");
    console.log(`[canonical-tip] sequencer ${keypair.address}`);
  } else {
    console.log(
      `[canonical-tip] resume tip #${existing.pixels.length - 1} · canvas ${existing.networkId}:${existing.pixels[0]!.hash.slice(0, 12)}…`,
    );
  }

  const node = new PixelLedgerNode({
    datadir,
    rpcPort,
    gossipPort,
    advertiseHost: advertise,
    autoSequenceMs: 1500,
    stallCheckMs: 15_000,
    label: "canonical-tip",
  });
  await node.start();
  startRpcServer(node, rpcPort);

  const snap = node.syncSnapshot();
  console.log(`[canonical-tip] RPC listening on :${rpcPort}`);
  console.log(`[canonical-tip] canvasId ${snap.canvasId}`);
  console.log(`[canonical-tip] GET /health /sync /pixels /spatial/snapshot /wave/tip  POST /tx`);
  console.log(`[canonical-tip] Set site build: VITE_PIXEL_RPC=https://<this-host>`);
  console.log(
    `[canonical-tip] Production default: also VITE_REQUIRE_PUBLIC_TIP=1 (refuse lab light)`,
  );
  console.log(`[canonical-tip] datadir ${datadir} — do not wipe (new Earth)`);

  await new Promise(() => {});
}

main().catch((e) => {
  console.error("[canonical-tip] FATAL", e);
  process.exit(1);
});

#!/usr/bin/env bun
/**
 * Pixel Ledger CLI
 *
 *   bun src/node/cli.ts init --datadir ./data/a
 *   bun src/node/cli.ts node --datadir ./data/a --rpc 8545 --gossip 9001
 *   bun src/node/cli.ts wallet create alice --datadir ./data/a
 *   bun src/node/cli.ts send --from alice --to <addr> --amount 100 --datadir ./data/a
 *   bun src/node/cli.ts balance <addr> --datadir ./data/a
 *   bun src/node/cli.ts join --peer http://127.0.0.1:8545 --datadir ./data/b
 */

import { mkdir } from "node:fs/promises";
import {
  PIXEL_LEDGER_NAME,
  generateLightKeypair,
  stateFromPixels,
  type SequencerId,
} from "../lib/pixel/index";
import { PixelLedgerNode } from "./node";
import { startRpcServer } from "./rpc-server";
import { ensureDatadir, loadOrCreateIdentity, loadWallet, saveChain, saveWallet } from "./store";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const cmd = process.argv[2] ?? "help";
  const datadir = arg("datadir", "./pixel-data")!;

  if (cmd === "help" || flag("help")) {
    console.log(`${PIXEL_LEDGER_NAME} CLI
  init [--datadir DIR]
  node [--datadir DIR] [--rpc PORT] [--gossip PORT] [--seed ws://host/gossip]
  join --peer http://HOST:RPC [--datadir DIR]
  wallet create NAME [--datadir DIR]
  send --from NAME --to ADDR --amount N [--memo TEXT] [--datadir DIR]
  balance ADDR|--wallet NAME [--datadir DIR]
  interactions
`);
    return;
  }

  if (cmd === "interactions") {
    const { INTERACTIONS } = await import("../lib/pixel/interactions");
    for (const i of INTERACTIONS) {
      console.log(`${i.status.padEnd(8)} ${i.channel.padEnd(8)} ${i.name} — ${i.summary}`);
    }
    return;
  }

  if (cmd === "init") {
    await ensureDatadir(datadir);
    const { keypair } = await loadOrCreateIdentity(datadir, "genesis");
    const node = new PixelLedgerNode({
      datadir,
      rpcPort: 0,
      gossipPort: 0,
    });
    // start() without gossip ports for init-only — use createGenesis via start with no listen
    const { createGenesis } = await import("../lib/pixel/index");
    const chain = await createGenesis(keypair);
    await saveChain(datadir, chain);
    console.log(`${PIXEL_LEDGER_NAME} initialized`);
    console.log(`  datadir: ${datadir}`);
    console.log(`  sequencer: ${keypair.address}`);
    console.log(`  genesis pixel: ${chain.pixels[0].hash.slice(0, 24)}…`);
    return;
  }

  if (cmd === "join") {
    const peer = arg("peer");
    if (!peer) throw new Error("--peer http://host:port required");
    await ensureDatadir(datadir);
    const { keypair } = await loadOrCreateIdentity(datadir, "joiner");
    const pixels = (await fetch(`${peer.replace(/\/$/, "")}/pixels`).then((r) =>
      r.json(),
    )) as Awaited<ReturnType<typeof import("../lib/pixel/index").serializeChain>>["pixels"];
    const info = await fetch(`${peer.replace(/\/$/, "")}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "pix_protocolInfo" }),
    }).then((r) => r.json());
    void info;
    const health = await fetch(`${peer.replace(/\/$/, "")}/health`).then((r) => r.json());
    const sequencers: SequencerId[] = [
      { address: health.address, publicKey: "unknown" },
      { address: keypair.address, publicKey: keypair.publicKey },
    ];
    // Prefer sequencers from peer chain snapshot if available via RPC verify
    const verify = await fetch(`${peer.replace(/\/$/, "")}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "pix_verifyChain" }),
    }).then((r) => r.json());
    void verify;

    // Pull full serialized chain if peer exposes it — rebuild from pixels + peer address
    const peerChain = await fetch(`${peer.replace(/\/$/, "")}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "pix_getLedgerPixels",
      }),
    }).then((r) => r.json());
    void peerChain;

    // Use full pixels from /pixels and inherit sequencers from genesis pixel proofs
    const seqSet = new Map<string, SequencerId>();
    for (const p of pixels) {
      seqSet.set(p.lightProof.sequencerAddress, {
        address: p.lightProof.sequencerAddress,
        publicKey: p.lightProof.sequencerPublicKey,
      });
    }
    seqSet.set(keypair.address, {
      address: keypair.address,
      publicKey: keypair.publicKey,
    });
    const chain = stateFromPixels(pixels, [...seqSet.values()]);
    await saveChain(datadir, chain);
    console.log(`Joined ${PIXEL_LEDGER_NAME} from ${peer}`);
    console.log(`  pixels: ${chain.pixels.length}`);
    console.log(`  local: ${keypair.address}`);
    return;
  }

  if (cmd === "node") {
    const rpcPort = Number(arg("rpc", "8545"));
    const gossipPort = Number(arg("gossip", "9001"));
    const seed = arg("seed");
    await mkdir(datadir, { recursive: true });
    const node = new PixelLedgerNode({
      datadir,
      rpcPort,
      gossipPort,
      seeds: seed ? [seed] : undefined,
      autoSequenceMs: 1500,
    });
    await node.start();
    startRpcServer(node, rpcPort);
    console.log(`${PIXEL_LEDGER_NAME} node running. Ctrl+C to stop.`);
    await new Promise(() => {});
    return;
  }

  if (cmd === "wallet" && process.argv[3] === "create") {
    const name = process.argv[4];
    if (!name) throw new Error("wallet name required");
    await ensureDatadir(datadir);
    const existing = await loadWallet(datadir, name);
    if (existing) {
      console.log(`Wallet ${name} exists: ${existing.address}`);
      return;
    }
    const kp = await generateLightKeypair();
    await saveWallet(datadir, name, kp);
    console.log(`Created wallet ${name}`);
    console.log(`  address: ${kp.address}`);
    return;
  }

  if (cmd === "send") {
    const fromName = arg("from");
    const to = arg("to");
    const amount = Number(arg("amount"));
    const memo = arg("memo", "Pixel Ledger transfer")!;
    if (!fromName || !to || !Number.isFinite(amount)) {
      throw new Error("--from --to --amount required");
    }
    const from = await loadWallet(datadir, fromName);
    if (!from) throw new Error(`wallet ${fromName} not found`);
    const node = new PixelLedgerNode({
      datadir,
      rpcPort: 0,
      gossipPort: Number(arg("gossip", "0")),
      autoSequenceMs: 0,
    });
    // Load chain without starting gossip if gossip 0
    const { loadChain, loadOrCreateIdentity } = await import("./store");
    const { keypair } = await loadOrCreateIdentity(datadir);
    node.keypair = keypair;
    const chain = await loadChain(datadir);
    if (!chain) throw new Error("No ledger — run init/node first");
    node.chain = chain;
    node.gossip = {
      broadcast() {},
      addPeer() {},
      peerCount: () => 0,
      stop() {},
    };
    const tx = await node.send(from, [{ amount, address: to }], {
      description: memo,
      recipientLabel: to.slice(0, 12),
    });
    await node.trySequence();
    await node.persist();
    console.log(`Sent ${amount} PIX`);
    console.log(`  txid: ${tx.txid.slice(0, 14)}…`);
    console.log(`  state: ${tx.state}`);
    console.log(`  pixels: ${node.chain.pixels.length}`);
    return;
  }

  if (cmd === "balance") {
    const wallet = arg("wallet");
    let address = process.argv[3]?.startsWith("pix") ? process.argv[3] : arg("address");
    if (wallet) {
      const w = await loadWallet(datadir, wallet);
      if (!w) throw new Error("wallet not found");
      address = w.address;
    }
    if (!address) throw new Error("address or --wallet required");
    const { loadChain } = await import("./store");
    const chain = await loadChain(datadir);
    if (!chain) throw new Error("No ledger");
    const { balanceOf } = await import("../lib/pixel/index");
    console.log(`${address}: ${balanceOf(chain, address)} PIX`);
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

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
  generatePixelKeypair,
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
  node [--datadir DIR] [--rpc PORT] [--gossip PORT] [--seed ws://host/gossip] [--advertise HOST]
       # Continuity: set CONTINUITY_WEBHOOK_SECRET for POST /continuity/order + ops write
  join --peer http://HOST:RPC [--datadir DIR] [--gossip-seed ws://HOST/gossip]
  wallet create NAME [--datadir DIR]
  wallet from-node [NAME] [--datadir DIR]   # use sequencer identity as a named wallet (holds genesis PIX)
  send --from NAME --to ADDR --amount N [--memo TEXT] [--datadir DIR]
  balance ADDR|--wallet NAME [--datadir DIR]
  interactions

Gate B — two nodes (local):
  # terminal A
  bun run pixel -- init --datadir ./data/a
  bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001
  # terminal B
  bun run pixel -- join --peer http://127.0.0.1:8545 --datadir ./data/b
  bun run pixel -- node --datadir ./data/b --rpc 8546 --gossip 9002 --seed ws://127.0.0.1:9001/gossip
  # see docs/demos/two-node.md
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
    const base = peer.replace(/\/$/, "");
    await ensureDatadir(datadir);
    const { keypair } = await loadOrCreateIdentity(datadir, "joiner");

    // Prefer /sync (Gate B); fall back to /pixels + /health
    let sync: {
      pixels: import("../lib/pixel/index").LedgerPixel[];
      sequencers?: SequencerId[];
      networkId?: number;
      gossipUrl?: string | null;
      address?: string;
      publicKey?: string;
    };
    const syncRes = await fetch(`${base}/sync`);
    if (syncRes.ok) {
      sync = (await syncRes.json()) as typeof sync;
    } else {
      const pixels = (await fetch(`${base}/pixels`).then((r) => r.json())) as typeof sync.pixels;
      const health = (await fetch(`${base}/health`).then((r) => r.json())) as {
        address: string;
        publicKey?: string;
        gossipUrl?: string;
      };
      sync = {
        pixels,
        gossipUrl: health.gossipUrl,
        address: health.address,
        publicKey: health.publicKey,
      };
    }
    if (!sync.pixels?.length) throw new Error("peer returned no pixels — is the node running?");

    const seqSet = new Map<string, SequencerId>();
    for (const s of sync.sequencers ?? []) {
      seqSet.set(s.address, s);
    }
    for (const p of sync.pixels) {
      seqSet.set(p.lightProof.sequencerAddress, {
        address: p.lightProof.sequencerAddress,
        publicKey: p.lightProof.sequencerPublicKey,
      });
    }
    if (sync.address && sync.publicKey) {
      seqSet.set(sync.address, { address: sync.address, publicKey: sync.publicKey });
    }
    seqSet.set(keypair.address, {
      address: keypair.address,
      publicKey: keypair.publicKey,
    });

    const chain = stateFromPixels(sync.pixels, [...seqSet.values()], sync.networkId);
    const { verifyChain } = await import("../lib/pixel/index");
    if (!(await verifyChain(chain))) {
      throw new Error("joined chain failed verifyChain — refuse to save");
    }
    await saveChain(datadir, chain);

    const gossipSeed = arg("gossip-seed") ?? sync.gossipUrl ?? undefined;
    if (gossipSeed?.startsWith("ws")) {
      const { savePeers } = await import("./store");
      await savePeers(datadir, [gossipSeed]);
      console.log(`  gossip seed saved: ${gossipSeed}`);
    }

    console.log(`Joined ${PIXEL_LEDGER_NAME} from ${base}`);
    console.log(`  pixels: ${chain.pixels.length}`);
    console.log(`  sequencers: ${chain.sequencers.length}`);
    console.log(`  local: ${keypair.address}`);
    console.log(`  next: bun run pixel -- node --datadir ${datadir} --rpc 8546 --gossip 9002 \\`);
    console.log(
      `          --seed ${gossipSeed ?? "ws://<peer-host>:<gossip>/gossip"} --advertise <your-host>`,
    );
    return;
  }

  if (cmd === "node") {
    // PORT / PIXEL_RPC_PORT for hosted tip (Railway, Docker); --rpc wins when passed.
    const rpcPort = Number(arg("rpc", process.env.PORT || process.env.PIXEL_RPC_PORT || "8545"));
    const gossipPort = Number(arg("gossip", process.env.PIXEL_GOSSIP_PORT || "9001"));
    const seed = arg("seed");
    const advertise = arg("advertise");
    await mkdir(datadir, { recursive: true });
    const { loadPeers } = await import("./store");
    const saved = await loadPeers(datadir);
    const seeds = seed ? [seed, ...saved.filter((s) => s !== seed)] : saved;
    const node = new PixelLedgerNode({
      datadir,
      rpcPort,
      gossipPort,
      seeds: seeds.length ? seeds : undefined,
      advertiseHost: advertise,
      autoSequenceMs: 1500,
      stallCheckMs: 15_000,
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
    const kp = await generatePixelKeypair();
    await saveWallet(datadir, name, kp);
    console.log(`Created wallet ${name}`);
    console.log(`  address: ${kp.address}`);
    return;
  }

  if (cmd === "wallet" && process.argv[3] === "from-node") {
    const name = process.argv[4] ?? "sequencer";
    await ensureDatadir(datadir);
    const { keypair } = await loadOrCreateIdentity(datadir, "genesis");
    await saveWallet(datadir, name, keypair);
    const { loadChain } = await import("./store");
    const { balanceOf } = await import("../lib/pixel/index");
    const chain = await loadChain(datadir);
    const bal = chain ? balanceOf(chain, keypair.address) : 0;
    console.log(`Sequencer identity saved as wallet "${name}"`);
    console.log(`  address: ${keypair.address}`);
    console.log(`  balance: ${bal} PIX (genesis light reward if you ran init)`);
    console.log(`  You are the illuminator for this datadir — send/illuminate with --from ${name}`);
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
    const { assertPixelAddress } = await import("../lib/pixel/crypto");
    assertPixelAddress(to, "--to");
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
      sendTo() {},
      announce() {},
      addPeer() {},
      peerCount: () => 0,
      peerUrls: () => [],
      stop() {},
      localGossipUrl: () => null,
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

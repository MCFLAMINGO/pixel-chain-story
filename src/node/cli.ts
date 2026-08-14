#!/usr/bin/env bun
/**
 * Pixel Ledger CLI — join the tip; do not invent a private Earth.
 *
 *   bun src/node/cli.ts join --peer https://pixel-tip-production.up.railway.app --datadir ./data/friend
 *   bun src/node/cli.ts node --datadir ./data/friend --rpc 8546 --gossip 9002
 *   bun src/node/cli.ts wallet create alice --datadir ./data/friend
 *
 * People: open /wallet on the site (phone). Never init.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  PIXEL_LEDGER_NAME,
  PUBLIC_TIP_RPC_DEFAULT,
  CROWNED_GENESIS_PREFIX,
  assertCrownedPublicTip,
  generatePixelKeypair,
  isCrownedGenesisHash,
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

function refuseInitMessage(): string {
  return `${PIXEL_LEDGER_NAME}: "init" does not invent a new Earth.

People: open /wallet on the site (Add to Home Screen).
Friends (laptop/VPS): join the crowned tip, then run node:

  bun run pixel -- join --peer ${PUBLIC_TIP_RPC_DEFAULT} --datadir ./data/friend
  bun run pixel -- node --datadir ./data/friend --rpc 8546 --gossip 9002

Confirm genesis starts with ${CROWNED_GENESIS_PREFIX}

Tip ceremony / CI lab only: tip:host or PIXEL_ALLOW_LAB_GENESIS=1 bun scripts/lab-forge-datadir.ts
See docs/demos/friend-invite.md`;
}

async function main() {
  const cmd = process.argv[2] ?? "help";
  const datadir = arg("datadir", "./pixel-data")!;

  if (cmd === "help" || flag("help")) {
    console.log(`${PIXEL_LEDGER_NAME} CLI
  join --peer http://HOST:RPC [--datadir DIR] [--gossip-seed ws://HOST/gossip] [--require-crowned]
  node [--datadir DIR] [--rpc PORT] [--gossip PORT] [--seed ws://host/gossip] [--advertise HOST]
  wallet create NAME [--datadir DIR]
  wallet from-node [NAME] [--datadir DIR]
  send --from NAME --to ADDR --amount N [--memo TEXT] [--datadir DIR]
  balance ADDR|--wallet NAME [--datadir DIR]
  backup [--out FILE] [--include-key] [--datadir DIR]
  restore --in FILE [--datadir DIR] [--force]
  interactions

People (phone): /wallet — not this CLI.
Friends — join crowned tip:
  bun run pixel -- join --peer ${PUBLIC_TIP_RPC_DEFAULT} --datadir ./data/friend --require-crowned
  bun run pixel -- node --datadir ./data/friend --rpc 8546 --gossip 9002
  # confirm genesis ${CROWNED_GENESIS_PREFIX}…
  # see docs/demos/friend-invite.md
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
    console.error(refuseInitMessage());
    process.exit(1);
  }

  if (cmd === "join") {
    const peer = arg("peer") ?? (flag("public-tip") ? PUBLIC_TIP_RPC_DEFAULT : undefined);
    if (!peer) throw new Error(`--peer http://host:port required (or --public-tip)`);
    const base = peer.replace(/\/$/, "");
    await ensureDatadir(datadir);
    const { keypair } = await loadOrCreateIdentity(datadir, "joiner");

    let sync: {
      pixels: import("../lib/pixel/index").LedgerPixel[];
      sequencers?: SequencerId[];
      networkId?: number;
      gossipUrl?: string | null;
      address?: string;
      publicKey?: string;
      genesisHash?: string;
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
        genesisHash?: string;
        networkId?: number;
      };
      sync = {
        pixels,
        gossipUrl: health.gossipUrl,
        address: health.address,
        publicKey: health.publicKey,
        genesisHash: health.genesisHash,
        networkId: health.networkId,
      };
    }
    if (!sync.pixels?.length) throw new Error("peer returned no pixels — is the tip running?");

    const genesisHash = sync.genesisHash ?? sync.pixels[0]!.hash;
    const networkId = sync.networkId ?? 0x5049;
    if (flag("require-crowned") || base.includes("pixel-tip-production")) {
      assertCrownedPublicTip({ genesisHash, networkId });
    } else if (!isCrownedGenesisHash(genesisHash)) {
      console.warn(
        `  warn: genesis ${genesisHash.slice(0, 16)}… is not crowned ${CROWNED_GENESIS_PREFIX}… (lab tip?)`,
      );
    }

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
    console.log(`  genesis: ${genesisHash.slice(0, 24)}…`);
    console.log(`  local: ${keypair.address}`);
    console.log(`  next: bun run pixel -- node --datadir ${datadir} --rpc 8546 --gossip 9002 \\`);
    console.log(
      `          --seed ${gossipSeed ?? "ws://<peer-host>:<gossip>/gossip"} --advertise <your-host>`,
    );
    return;
  }

  if (cmd === "node") {
    const rpcPort = Number(arg("rpc", process.env.PORT || process.env.PIXEL_RPC_PORT || "8545"));
    const gossipPort = Number(arg("gossip", process.env.PIXEL_GOSSIP_PORT || "9001"));
    const seed = arg("seed");
    const advertise = arg("advertise");
    await mkdir(datadir, { recursive: true });
    const { loadPeers, loadChain } = await import("./store");
    const existing = await loadChain(datadir);
    if (!existing) {
      console.error(
        `No ledger in ${datadir}. Join the tip first (do not init):\n` +
          `  bun run pixel -- join --peer ${PUBLIC_TIP_RPC_DEFAULT} --datadir ${datadir} --require-crowned\n` +
          `Tip host / CI lab: tip:host or PIXEL_ALLOW_LAB_GENESIS=1 bun scripts/lab-forge-datadir.ts`,
      );
      process.exit(1);
    }
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
    const { keypair } = await loadOrCreateIdentity(datadir, "node");
    await saveWallet(datadir, name, keypair);
    const { loadChain } = await import("./store");
    const { balanceOf } = await import("../lib/pixel/index");
    const chain = await loadChain(datadir);
    const bal = chain ? balanceOf(chain, keypair.address) : 0;
    console.log(`Node identity saved as wallet "${name}"`);
    console.log(`  address: ${keypair.address}`);
    console.log(`  balance: ${bal} PIX`);
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
    const { loadChain, loadOrCreateIdentity } = await import("./store");
    const { keypair } = await loadOrCreateIdentity(datadir);
    node.keypair = keypair;
    const chain = await loadChain(datadir);
    if (!chain) throw new Error("No ledger — join the tip first");
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

  /**
   * One file you can hand to somebody. See src/node/backup.ts for why this exists:
   * one volume currently holds the only copy of the history and the only key that
   * can extend it.
   */
  if (cmd === "backup") {
    const out = arg("out") ?? `./pixel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const includeKey = flag("include-key");
    const { loadChain, loadIdentity } = await import("./store");
    const { createBackup, describeBackup } = await import("./backup");
    const chain = await loadChain(datadir);
    if (!chain) throw new Error(`No ledger in ${datadir}. Nothing to back up.`);
    const identity = (await loadIdentity(datadir)) ?? undefined;

    const bundle = await createBackup({ chain, identity, includeKey });
    await writeFile(out, JSON.stringify(bundle), "utf8");
    console.log(`Backup written — verified by replaying every pixel.`);
    console.log(`  file       ${out}`);
    for (const line of describeBackup(bundle.manifest)) console.log(`  ${line}`);
    if (!includeKey) {
      console.log("");
      console.log("This file holds the history, not the key. Anyone can hold it safely,");
      console.log("and the more people who do, the harder the chain is to lose.");
      console.log("To hand over the ability to extend the chain too: --include-key");
    } else {
      console.log("");
      console.log("THIS FILE CAN EXTEND THE CHAIN. Treat it like the key it contains:");
      console.log("give it only to someone you would trust to sequence, and send it");
      console.log("over something private.");
    }
    console.log("");
    console.log(`Restore with:  bun run pixel -- restore --in ${out} --datadir ./restored`);
    return;
  }

  if (cmd === "restore") {
    const inFile = arg("in");
    if (!inFile) throw new Error("restore needs --in FILE");
    const { readBackup, describeBackup } = await import("./backup");
    const { loadChain } = await import("./store");
    const raw = await readFile(inFile, "utf8");
    const { chain, manifest, identity } = await readBackup(raw);

    const existing = await loadChain(datadir);
    if (existing && !flag("force")) {
      throw new Error(
        `${datadir} already holds a chain at #${existing.pixels.length - 1}. ` +
          `Restoring would replace it. Pass --force if that is what you want.`,
      );
    }

    await ensureDatadir(datadir);
    await saveChain(datadir, chain);
    if (identity) {
      const { saveIdentity } = await import("./store");
      await saveIdentity(datadir, identity);
    }
    console.log("Restored — the chain replayed cleanly before anything was written.");
    for (const line of describeBackup(manifest)) console.log(`  ${line}`);
    console.log("");
    if (identity) {
      console.log("The sequencer key came with it, so this datadir can extend the chain.");
      console.log(`  bun run pixel -- node --datadir ${datadir} --rpc 8546 --gossip 9002`);
    } else {
      console.log("History only — this datadir can serve and verify, not extend.");
      console.log(`  bun run pixel -- node --datadir ${datadir} --rpc 8546 --gossip 9002`);
    }
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

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
import { keyAtRest } from "./store";
import {
  authorizationMessage,
  createSequencerJoin,
  MEMBERSHIP_ACTIVATION_DELAY,
  possessionMessage,
} from "../lib/pixel/membership";
import { signPixel } from "../lib/pixel/scheme";
import {
  assertNodePassphrase,
  NODE_KEY_ENV,
  nodePassphrase,
  plaintextKeyWarning,
} from "./key-seal";

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
  join --peer http://HOST:RPC [--datadir DIR] [--mirrors FILE] [--gossip-seed ws://HOST/gossip] [--require-crowned]
  join --mirrors FILE [--datadir DIR] [--require-crowned]   # try each mirror in tip-mirrors.json
  join --public-tip [--datadir DIR] [--require-crowned]     # peer = default + mirrors file
  node [--datadir DIR] [--rpc PORT] [--gossip PORT] [--seed ws://host/gossip] [--advertise HOST]
  key status|seal [--datadir DIR]        seal the node key at rest (PIXEL_KEY_PASSPHRASE)
  membership status [--peer URL]         who may produce, and when a new record activates
  membership request --datadir DIR --peer URL --authorizer <pix1…> [--out FILE] [--window N]
  membership authorize --datadir DIR --request FILE [--peer URL]
  membership invite --datadir <incumbent> --joiner-datadir <joiner> [--peer URL]
  wallet create NAME [--datadir DIR]
  wallet from-node [NAME] [--datadir DIR]
  send --from NAME --to ADDR --amount N [--memo TEXT] [--datadir DIR]
  balance ADDR|--wallet NAME [--datadir DIR]
  backup [--out FILE] [--include-key] [--datadir DIR]
  restore --in FILE [--datadir DIR] [--force]
  interactions

People (phone): /wallet — not this CLI.
Friends — join crowned tip (tries tip-mirrors.json when --mirrors or --public-tip):
  bun run pixel -- join --public-tip --datadir ./data/friend --require-crowned
  bun run pixel -- node --datadir ./data/friend --rpc 8546 --gossip 9002 --advertise <your-host>
  # confirm genesis ${CROWNED_GENESIS_PREFIX}…
  # see docs/demos/friend-invite.md · docs/DURABILITY.md
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
    const mirrorsPath = arg("mirrors");
    const peer =
      arg("peer") ?? (flag("public-tip") ? PUBLIC_TIP_RPC_DEFAULT : undefined);
    if (!peer && !mirrorsPath && !flag("public-tip")) {
      throw new Error(
        `--peer http://host:port required (or --public-tip / --mirrors tip-mirrors.json)`,
      );
    }
    await ensureDatadir(datadir);
    const { keypair } = await loadOrCreateIdentity(datadir, "joiner");

    const { fetchSyncViaMirrors, TipMirrorError, loadTipMirrorsOrBuiltin } = await import(
      "../lib/pixel/tip-mirrors"
    );
    // --public-tip or an explicit mirrors file loads the list; bare --peer does not
    // surprise-dial Railway after a lab peer fails.
    const useMirrors = Boolean(mirrorsPath || flag("public-tip"));
    const requireCrowned =
      flag("require-crowned") ||
      Boolean(peer?.includes("pixel-tip-production")) ||
      flag("public-tip");

    let sync: Awaited<ReturnType<typeof fetchSyncViaMirrors>>;
    try {
      sync = await fetchSyncViaMirrors({
        peer,
        mirrorsPath: useMirrors ? mirrorsPath : undefined,
        mirrors: useMirrors ? undefined : peer ? { ...loadTipMirrorsOrBuiltin(), mirrors: [] } : undefined,
        requireCrowned,
      });
    } catch (err) {
      if (err instanceof TipMirrorError) {
        console.error(`join failed after ${err.attempts.length} mirror attempt(s):`);
        for (const a of err.attempts) console.error(`  ${a.rpc} → ${a.error}`);
      }
      throw err;
    }

    const genesisHash = sync.genesisHash ?? sync.pixels[0]!.hash;
    const networkId = sync.networkId ?? loadTipMirrorsOrBuiltin(mirrorsPath).networkId;
    if (requireCrowned) {
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

    const mirrorsFile = loadTipMirrorsOrBuiltin(mirrorsPath);
    const gossipSeed =
      arg("gossip-seed") ??
      sync.gossipUrl ??
      mirrorsFile.gossipSeeds?.[0] ??
      undefined;
    if (gossipSeed?.startsWith("ws") && !/127\.0\.0\.1|localhost/.test(gossipSeed)) {
      const { savePeers } = await import("./store");
      await savePeers(datadir, [gossipSeed]);
      console.log(`  gossip seed saved: ${gossipSeed}`);
    } else if (gossipSeed && /127\.0\.0\.1|localhost/.test(gossipSeed)) {
      console.log(
        `  gossip seed from peer is localhost (${gossipSeed}) — not saved; pass --gossip-seed or --advertise on the tip`,
      );
    }

    console.log(`Joined ${PIXEL_LEDGER_NAME} from ${sync.sourceRpc}${sync.sourceId ? ` (${sync.sourceId})` : ""}`);
    console.log(`  pixels: ${chain.pixels.length}`);
    console.log(`  sequencers: ${chain.sequencers.length}`);
    console.log(`  genesis: ${genesisHash.slice(0, 24)}…`);
    console.log(`  local: ${keypair.address}`);
    console.log(`  next: bun run pixel -- node --datadir ${datadir} --rpc 8546 --gossip 9002 \\`);
    console.log(
      `          --seed ${gossipSeed && !/127\.0\.0\.1|localhost/.test(gossipSeed) ? gossipSeed : "ws://<peer-host>:<gossip>/gossip"} --advertise <your-host>`,
    );
    return;
  }

  if (cmd === "membership") {
    const sub = process.argv[3];
    const peer = arg("peer") ?? PUBLIC_TIP_RPC_DEFAULT;

    if (sub === "status") {
      const sync = (await (await fetch(`${peer}/sync`)).json()) as {
        pixels: Array<{ index: number; lightProof: { electable?: string[] } }>;
      };
      const tip = sync.pixels[sync.pixels.length - 1];
      console.log(`tip: #${tip?.index}`);
      console.log(`electable now: ${(tip?.lightProof.electable ?? []).join(", ")}`);
      console.log(`next pixel: #${sync.pixels.length}`);
      console.log(`activation delay: ${MEMBERSHIP_ACTIVATION_DELAY} pixels`);
      return;
    }

    /**
     * JOINER SIDE — prove you hold the address, without sending anyone your key.
     *
     * Prints a request blob containing your address, public key, scheme, and a possession
     * signature. It carries **no secret**; it is safe to send over any channel.
     *
     * ## Why a window of signatures rather than one
     *
     * `includedAt` is inside the signed claim, so both signers must agree on the height
     * before the record is committed — and you cannot know when the incumbent will get
     * round to authorising you. So this pre-signs a window of upcoming heights and the
     * authorizer picks whichever one is current.
     *
     * Solving it in the CLI rather than in the record format is deliberate. The format is
     * committed on-chain, specified in SPEC.md §4.2, and pinned in the frozen vectors —
     * a scheduling inconvenience is not a reason to change consensus.
     */
    if (sub === "request") {
      const { loadOrCreateIdentity: loadId } = await import("./store");
      const { keypair } = await loadId(datadir, "node");
      const scheme = (keypair.scheme ?? "PIX-ML-DSA-65") as "PIX-ML-DSA-65" | "PIX-HASH-OTS-128";

      const health = (await (await fetch(`${peer}/health`)).json()) as {
        pixels: number;
        networkId: number;
      };
      const from = health.pixels;

      // A hash-OTS key burns a one-time leaf per signature, so it gets a window of one and
      // must be authorised promptly. ML-DSA is multi-use, so a window costs nothing.
      const requested = Number(arg("window") ?? (scheme === "PIX-HASH-OTS-128" ? 1 : 24));
      const window = scheme === "PIX-HASH-OTS-128" ? 1 : Math.max(1, Math.min(requested, 64));
      if (scheme === "PIX-HASH-OTS-128" && requested > 1) {
        console.error(
          `note: hash-OTS signs once per leaf, so the window is 1 rather than ${requested}.\n` +
            `      Ask the incumbent to authorise before pixel #${from + 1}.`,
        );
      }

      const authorizedBy = arg("authorizer") ?? "";
      if (!authorizedBy) {
        console.error(
          "usage: pixel membership request --datadir DIR --peer URL --authorizer <their pix1 address>\n" +
            "       (the authorizer's address is inside the signed claim, so it must be named now)",
        );
        process.exit(1);
      }

      const offers: Array<{ includedAt: number; possession: string }> = [];
      for (let h = from; h < from + window; h++) {
        const claim = {
          kind: "sequencer-join" as const,
          address: keypair.address,
          publicKey: keypair.publicKey,
          scheme,
          includedAt: h,
          authorizedBy,
        };
        offers.push({
          includedAt: h,
          possession: await signPixel(possessionMessage(claim), keypair),
        });
      }

      const request = {
        v: 1 as const,
        kind: "sequencer-join" as const,
        address: keypair.address,
        publicKey: keypair.publicKey,
        scheme,
        authorizedBy,
        networkId: health.networkId,
        tipAtRequest: from - 1,
        offers,
      };

      const out = arg("out");
      const text = JSON.stringify(request, null, 2);
      if (out) {
        await Bun.write(out, text + "\n");
        console.error(`wrote ${out} — send this to ${authorizedBy}. It contains no secret.`);
        console.error(`valid for pixels #${from}..#${from + window - 1}.`);
      } else {
        console.log(text);
      }
      return;
    }

    /**
     * INCUMBENT SIDE — authorise a request, without ever holding the joiner's key.
     *
     * Picks the offer matching the height the tip is actually at, adds your authorization
     * signature, and submits the completed record. If the window has passed, it says so and
     * asks for a fresh request rather than guessing — a signature means what it signed.
     */
    if (sub === "authorize") {
      const file = arg("request");
      if (!file) {
        console.error(
          "usage: pixel membership authorize --datadir DIR --request FILE [--peer URL]",
        );
        process.exit(1);
      }
      const request = JSON.parse(await Bun.file(file).text()) as {
        kind: "sequencer-join";
        address: string;
        publicKey: string;
        scheme: "PIX-ML-DSA-65" | "PIX-HASH-OTS-128";
        authorizedBy: string;
        networkId: number;
        offers: Array<{ includedAt: number; possession: string }>;
      };

      const { loadOrCreateIdentity: loadId } = await import("./store");
      const { keypair: incumbent } = await loadId(datadir, "node");

      if (request.authorizedBy !== incumbent.address) {
        console.error(
          `this request names ${request.authorizedBy} as authorizer, but this datadir holds\n` +
            `${incumbent.address}. The authorizer is inside the signed claim, so it cannot be\n` +
            `substituted — ask for a request naming this address.`,
        );
        process.exit(1);
      }

      const health = (await (await fetch(`${peer}/health`)).json()) as {
        pixels: number;
        networkId: number;
      };
      if (request.networkId !== health.networkId) {
        console.error(
          `request is for network ${request.networkId}, this node is ${health.networkId}`,
        );
        process.exit(1);
      }

      const includedAt = health.pixels;
      const offer = request.offers.find((o) => o.includedAt === includedAt);
      if (!offer) {
        const lo = request.offers[0]?.includedAt;
        const hi = request.offers[request.offers.length - 1]?.includedAt;
        console.error(
          `the tip is at pixel #${includedAt}, outside this request's window #${lo}..#${hi}.\n` +
            `Ask for a fresh request: the height is signed, so nothing here can be adjusted.`,
        );
        process.exit(1);
      }

      const claim = {
        kind: request.kind,
        address: request.address,
        publicKey: request.publicKey as `0x${string}` | string,
        scheme: request.scheme,
        includedAt,
        authorizedBy: incumbent.address,
      };
      const record = {
        ...claim,
        possession: offer.possession,
        authorization: await signPixel(authorizationMessage(claim), incumbent),
      };

      const res = await fetch(`${peer}/membership`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      });
      const body = (await res.json()) as Record<string, unknown>;
      if (!res.ok || body.ok !== true) {
        console.error(`membership refused: ${String(body.error ?? res.status)}`);
        process.exit(1);
      }
      console.log(`authorised ${request.address}`);
      console.log(`  committing at pixel #${includedAt}, electable from #${body.activeAt}`);
      console.log(
        `  the delay is deliberate: a producer must not be elected by a set it just wrote.`,
      );
      return;
    }

    /**
     * Invite a second operator.
     *
     * Both keys are needed, which is the ceremony rather than a limitation: adding an
     * operator is two people agreeing, and the record is the artifact of that agreement.
     * This is the bootstrap form, for when one person holds both — the two halves can be
     * signed on separate machines and assembled, and that is the shape to build when
     * there is a third operator to invite.
     */
    if (sub === "invite") {
      const joinerDir = arg("joiner-datadir");
      if (!joinerDir) {
        console.error(
          "usage: pixel membership invite --datadir <incumbent> --joiner-datadir <joiner> [--peer URL]",
        );
        process.exit(1);
      }
      const { loadOrCreateIdentity: loadId } = await import("./store");
      const incumbent = (await loadId(datadir, "node")).keypair;
      const joiner = (await loadId(joinerDir, "node")).keypair;

      const health = (await (await fetch(`${peer}/health`)).json()) as { pixels: number };
      const includedAt = health.pixels;

      const record = await createSequencerJoin({
        joiner: {
          address: joiner.address,
          publicKey: joiner.publicKey,
          scheme: joiner.scheme,
        },
        authorizer: { address: incumbent.address },
        includedAt,
        sign: (message, who) => signPixel(message, who === "joiner" ? joiner : incumbent),
      });

      const res = await fetch(`${peer}/membership`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      });
      const out = (await res.json()) as Record<string, unknown>;
      if (!res.ok || out.ok !== true) {
        console.error(`membership refused: ${String(out.error ?? res.status)}`);
        process.exit(1);
      }
      console.log(`invited ${joiner.address}`);
      console.log(`  authorised by ${incumbent.address}`);
      console.log(`  committed at pixel #${includedAt}, electable from #${out.activeAt}`);
      console.log(
        `  the delay is deliberate: a producer must not be elected by a set it just wrote.`,
      );
      return;
    }

    console.error(
      "usage: pixel membership <status|request|authorize|invite> [--datadir DIR] [--peer URL]\n" +
        "  status     who may produce, and when a new record activates\n" +
        "  request    JOINER: prove you hold your address (no secret leaves your machine)\n" +
        "  authorize  INCUMBENT: sign a request and submit it\n" +
        "  invite     bootstrap only: both keys on one machine",
    );
    process.exit(1);
  }

  if (cmd === "key") {
    const sub = process.argv[3];
    const { identityAtRest, loadIdentity, saveIdentity } = await import("./store");
    const at = await identityAtRest(datadir);
    if (at === null) {
      console.error(`No nodekey.json in ${datadir}.`);
      process.exit(1);
    }

    if (sub === "status") {
      console.log(`node key at rest: ${at}`);
      if (at === "plaintext") console.log(plaintextKeyWarning(datadir));
      return;
    }

    if (sub === "seal") {
      if (at === "sealed") {
        console.log("Already sealed. Nothing to do.");
        return;
      }
      const passphrase = nodePassphrase();
      if (!passphrase) {
        console.error(
          `Set ${NODE_KEY_ENV} to the passphrase you want to seal with, then run this again:\n` +
            `  ${NODE_KEY_ENV}='<passphrase>' bun run pixel -- key seal --datadir ${datadir}\n` +
            `The same variable must be present when the node starts, or it cannot open its key.`,
        );
        process.exit(1);
      }
      assertNodePassphrase(passphrase);
      // Read plaintext first, then write sealed. saveIdentity seals whenever the
      // passphrase is set, so this is a read-then-write rather than a special path —
      // one sealing implementation, exercised by normal operation.
      const identity = await loadIdentity(datadir);
      if (!identity) {
        console.error("Could not read the existing key.");
        process.exit(1);
      }
      await saveIdentity(datadir, identity);
      const now = await identityAtRest(datadir);
      if (now !== "sealed") {
        console.error("Seal did not take effect — the key is unchanged.");
        process.exit(1);
      }
      console.log(
        `Sealed ${datadir}/nodekey.json.\n` +
          `  address: ${identity.address}\n` +
          `Keep ${NODE_KEY_ENV} somewhere you will still have it after losing this machine.\n` +
          `Without it the key cannot be opened, and on a single-sequencer chain that key\n` +
          `is the only address permitted to produce.`,
      );
      return;
    }

    console.error("usage: pixel key status|seal [--datadir DIR]");
    process.exit(1);
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
    // Said out loud at every start, not once at seal time. An operator who has been
    // meaning to seal it for three months should be reminded on the three-month-th day.
    if (keyAtRest() === "plaintext") {
      console.warn(plaintextKeyWarning(datadir));
    } else {
      console.log(`[pixel-ledger] node key is sealed at rest ✓`);
    }
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
    console.log(`  content-addressed name  pixel-backup-${bundle.manifest.chainDigest.slice(0, 16)}.json`);
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

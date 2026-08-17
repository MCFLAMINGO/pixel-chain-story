#!/usr/bin/env bun
/**
 * Tip mirrors — discovery cattle, not consensus.
 *
 * Proves:
 *   1. tip-mirrors.json parses and matches crowned canvas ids
 *   2. a dead first mirror falls through to a live second
 *   3. require-crowned refuses a foreign genesis even if the host answers
 *   4. bare --peer style (empty mirror list) still works for lab tips
 */

import { createServer } from "node:http";
import { join } from "node:path";

import { createGenesis, tipHash } from "../src/lib/pixel/chain";
import {
  CROWNED_GENESIS_HASH,
  CROWNED_NETWORK_ID,
} from "../src/lib/pixel/crowned-genesis";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import {
  TipMirrorError,
  fetchSyncViaMirrors,
  loadTipMirrors,
  parseTipMirrors,
  tipMirrorsThesis,
} from "../src/lib/pixel/tip-mirrors";

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

console.log("═══ TIP MIRRORS ═══\n");

const thesis = tipMirrorsThesis();
check(thesis.red.length >= 1, "thesis still names the remaining SPOF honestly");

const file = loadTipMirrors(join(import.meta.dir, "../tip-mirrors.json"));
check(file.networkId === CROWNED_NETWORK_ID, "committed mirrors file is network 20553");
check(file.genesisHash === CROWNED_GENESIS_HASH, "committed mirrors file pins crowned genesis");
check(file.mirrors.length >= 1, "at least one mirror is listed");
check(
  file.mirrors[0]!.rpc.includes("railway") || file.mirrors[0]!.rpc.startsWith("http"),
  "primary mirror is an HTTP RPC URL",
);

{
  let threw = false;
  try {
    parseTipMirrors({ networkId: 1, genesisHash: "x", mirrors: [] });
  } catch {
    threw = true;
  }
  check(threw, "empty mirrors[] is refused at parse");
}

const seq = await generatePixelKeypair("PIX-ML-DSA-65");
const lab = await createGenesis(seq, 0x5049);
const tip = tipHash(lab);

function serveSync(pixels: unknown, health: Record<string, unknown>): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url ?? "/";
      res.setHeader("content-type", "application/json");
      if (path.startsWith("/sync")) {
        res.end(
          JSON.stringify({
            pixels,
            networkId: health.networkId,
            genesisHash: health.genesisHash,
            gossipUrl: health.gossipUrl ?? null,
            address: health.address,
            publicKey: health.publicKey,
            sequencers: [{ address: health.address, publicKey: health.publicKey }],
          }),
        );
        return;
      }
      if (path.startsWith("/health")) {
        res.end(JSON.stringify(health));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("no port");
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      });
    });
  });
}

const dead = await serveSync([], {
  networkId: 0x5049,
  genesisHash: lab.pixels[0]!.hash,
  address: seq.address,
  publicKey: seq.publicKey,
});
// Force dead by closing immediately after we know the URL — first fetch fails.
const deadUrl = dead.url;
dead.close();

const live = await serveSync(lab.pixels, {
  networkId: 0x5049,
  genesisHash: lab.pixels[0]!.hash,
  address: seq.address,
  publicKey: seq.publicKey,
  gossipUrl: "ws://127.0.0.1:9/gossip",
});

try {
  const sync = await fetchSyncViaMirrors({
    mirrors: {
      networkId: 0x5049,
      genesisHash: lab.pixels[0]!.hash,
      mirrors: [
        { id: "dead", rpc: deadUrl },
        { id: "live", rpc: live.url },
      ],
    },
    timeoutMs: 2000,
  });
  check(sync.sourceId === "live", "falls through dead mirror to live");
  check(sync.pixels.length === lab.pixels.length, "live mirror returns the lab pixels");
  check(sync.pixels[sync.pixels.length - 1]!.hash === tip, "tip hash matches");
} finally {
  live.close();
}

{
  const foreign = await createGenesis(seq, 99);
  const bad = await serveSync(foreign.pixels, {
    networkId: 99,
    genesisHash: foreign.pixels[0]!.hash,
    address: seq.address,
    publicKey: seq.publicKey,
  });
  try {
    await fetchSyncViaMirrors({
      mirrors: {
        networkId: CROWNED_NETWORK_ID,
        genesisHash: CROWNED_GENESIS_HASH,
        mirrors: [{ id: "foreign", rpc: bad.url }],
      },
      requireCrowned: true,
      timeoutMs: 2000,
    });
    check(false, "require-crowned must refuse foreign genesis");
  } catch (err) {
    check(err instanceof TipMirrorError, "refusal is TipMirrorError");
    check(
      /refuse wrong Earth|crowned|network/i.test(String(err)),
      "refusal names the crowned check",
    );
  } finally {
    bad.close();
  }
}

{
  const only = await serveSync(lab.pixels, {
    networkId: 0x5049,
    genesisHash: lab.pixels[0]!.hash,
    address: seq.address,
    publicKey: seq.publicKey,
  });
  try {
    const sync = await fetchSyncViaMirrors({
      peer: only.url,
      mirrors: {
        networkId: CROWNED_NETWORK_ID,
        genesisHash: CROWNED_GENESIS_HASH,
        mirrors: [],
      },
      timeoutMs: 2000,
    });
    check(sync.sourceId === "cli-peer", "bare peer works without walking Railway mirrors");
  } finally {
    only.close();
  }
}

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} ═══`);
  process.exit(1);
}
console.log("═══ PASS — mirrors are cattle; genesis still binds ═══");

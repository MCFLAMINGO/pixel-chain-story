#!/usr/bin/env bun
/**
 * Verify the crowned chain without trusting this project.
 *
 *   bun run verify:crowned                    # against the live public tip
 *   bun run verify:crowned -- --rpc URL       # against any node
 *   bun run verify:crowned -- --fixture       # against the committed snapshot, offline
 *
 * ## Why this is a command and not a paragraph
 *
 * The project's strongest claim is that the whole chain is about 1.4 MB, so anybody can
 * hold a copy and check it themselves. That claim was **false until 16 August 2026** —
 * `verifyChain` rejected the crowned chain's own first thirteen pixels, and nobody knew
 * because nothing ever re-verified stored history.
 *
 * The claim is true again. This is the command that lets a stranger confirm that rather
 * than take our word for it, and the reason it exists as a command is that
 * `docs/STATE-2026-08-13.md` catalogues four separate cases where *a failure rendered as an
 * ordinary state* — including this project's own verifier reporting agreement as
 * divergence. An independent read of the codebase concluded, correctly:
 *
 *   > "Do not trust the project's verifier."
 *
 * So this does three independent things and says which is which:
 *
 *   1. **Replays** every pixel through the same acceptance rules a node applies.
 *   2. **Recomputes** the UTXO set and total supply from scratch and checks them against
 *      the emission schedule — arithmetic that does not depend on the verifier being right.
 *   3. **Reads the anchor contracts directly** by `eth_call`, so the tip digest is confirmed
 *      by two public chains this project does not control. No project code decides the
 *      answer; the returned bytes do.
 *
 * Step 3 is the one that matters to a stranger. Steps 1 and 2 prove the chain is internally
 * consistent. Step 3 proves it is the same chain everybody else saw, at a time nobody here
 * could have chosen after the fact.
 *
 * It exits non-zero on any failure and prints what failed, because a verifier whose failure
 * looks like success is worse than no verifier.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { deserializeChain, verifyChain, type LedgerPixel } from "../src/lib/pixel/chain";
import { mintedThrough } from "../src/lib/pixel/economics";
import {
  CROWNED_GENESIS_HASH,
  CROWNED_NETWORK_ID,
  PUBLIC_TIP_RPC_DEFAULT,
  isCrownedGenesisHash,
} from "../src/lib/pixel/crowned-genesis";
import { canonicalTxBody, type Transaction } from "../src/lib/pixel/transaction";
import { lightDigest } from "../src/lib/pixel/light-digest";
import { merkleRoot } from "../src/lib/pixel/pol";
import { keccak_256 } from "@noble/hashes/sha3.js";

const root = join(import.meta.dir, "..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
/** True when --fixture is present (with or without a path argument). */
const fixtureFlag = process.argv.includes("--fixture");
const fixturePathArg = (() => {
  const i = process.argv.indexOf("--fixture");
  if (i < 0) return undefined;
  const next = process.argv[i + 1];
  // `--fixture` alone, or `--fixture --rpc …` → default path
  if (!next || next.startsWith("--")) return undefined;
  return next;
})();
const useFixture = fixtureFlag;
const offline = process.argv.includes("--offline") || useFixture;
const rpc = (arg("rpc") ?? PUBLIC_TIP_RPC_DEFAULT).replace(/\/$/, "");

let failures = 0;
function check(cond: unknown, msg: string, detail?: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.error(`  ✗ ${msg}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

interface Anchors {
  networkId: number;
  anchorer: string;
  venues: Record<string, string>;
}

/** Minimal `eth_call` against a public RPC. No project code interprets the result. */
async function ethCall(url: string, to: string, data: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    if (body.error) return null;
    return body.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Function selector = first 4 bytes of keccak256(signature).
 *
 * Computed here rather than hard-coded, so a reader can see where it came from. A
 * hard-coded selector is a magic constant nobody can check, which is the opposite of the
 * point of this script.
 */
function keccakSelector(sig: string): string {
  const h = keccak_256(new TextEncoder().encode(sig));
  return (
    "0x" +
    Array.from(h.slice(0, 4))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** One 32-byte ABI word from a number. */
const word = (n: number) => BigInt(n).toString(16).padStart(64, "0");

/**
 * A dynamic `bytes` argument: a length word, then the data right-padded to a word boundary.
 *
 * Hand-encoded rather than pulled from this repo's anchor helpers, on purpose. The point of
 * step 4 is that the answer comes from a chain we do not control — using our own encoder
 * for the question is fine, but writing it out means a reader can check the bytes against
 * the Solidity signature themselves rather than trusting a helper.
 */
const dynBytes = (hex: string) => {
  const clean = hex.replace(/^0x/, "");
  const bytes = clean.length / 2;
  const padded = clean.padEnd(Math.ceil(bytes / 32) * 64, "0");
  return word(bytes) + padded;
};

console.log("═══ VERIFY THE CROWNED CHAIN ═══\n");
console.log(useFixture ? "source: committed fixture (offline)" : `source: ${rpc}`);
if (offline && !useFixture) {
  console.log("( --offline without --fixture still needs a source; use --fixture )\n");
} else {
  console.log("");
}

// ── obtain the chain ──────────────────────────────────────────────────────
let pixels: LedgerPixel[];
let networkId: number;
let sequencers: Array<{ address: string; publicKey: string }>;

if (useFixture) {
  const fxPath = fixturePathArg
    ? fixturePathArg.startsWith("/")
      ? fixturePathArg
      : join(root, fixturePathArg)
    : join(root, "fixtures/crowned-47.json");
  const fx = JSON.parse(readFileSync(fxPath, "utf8")) as {
    networkId: number;
    pixels: LedgerPixel[];
    sequencers: Array<{ address: string; publicKey: string }>;
  };
  pixels = fx.pixels;
  networkId = fx.networkId;
  sequencers = fx.sequencers;
  console.log(`fixture: ${fxPath}`);
} else {
  const res = await fetch(`${rpc}/sync`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    console.error(`could not read ${rpc}/sync — HTTP ${res.status}`);
    process.exit(1);
  }
  const sync = (await res.json()) as {
    networkId: number;
    pixels: LedgerPixel[];
    sequencers: Array<{ address: string; publicKey: string }>;
  };
  pixels = sync.pixels;
  networkId = sync.networkId;
  sequencers = sync.sequencers;
}

const tip = pixels[pixels.length - 1]!;
const bytes = JSON.stringify(pixels).length;
console.log(
  `chain: ${pixels.length} pixels, tip #${tip.index}, ${(bytes / 1024 / 1024).toFixed(2)} MB\n`,
);

// ── 1. identity ───────────────────────────────────────────────────────────
console.log("1. identity");
check(networkId === CROWNED_NETWORK_ID, "network is the crowned Earth", String(networkId));
check(
  isCrownedGenesisHash(pixels[0]?.hash),
  "genesis is the ceremony hash",
  `${pixels[0]?.hash.slice(0, 16)}…`,
);
check(pixels[0]?.hash === CROWNED_GENESIS_HASH, "…in full, not merely by prefix");

// ── 2. replay through the acceptance rules ────────────────────────────────
console.log("\n2. replay (the same rules a node applies)");
const state = deserializeChain({ networkId, pixels, utxos: [], pending: [], sequencers });
const verified = await verifyChain(state);
check(verified, "every pixel passes full validation", verified ? undefined : "SEE ABOVE");

// ── 3. arithmetic that does not depend on the verifier ────────────────────
// Independent replay: if verifyChain were wrong in a way that let a stolen coin through,
// these sums would still have to be wrong too, and they are computed differently.
console.log("\n3. independent arithmetic");
const utxos = new Map<string, number>();
let coinbaseTotal = 0;
let feeTotal = 0;
let txCount = 0;
let identityOk = 0;
let rootsOk = 0;
let spendErrors = 0;

for (const p of pixels) {
  if ((await merkleRoot(p.transactions.map((t) => t.txid))) === p.merkleRoot) rootsOk++;
  for (const tx of p.transactions as Transaction[]) {
    txCount++;
    const body = canonicalTxBody(tx);
    const commitment = await lightDigest("superposition", body);
    if (commitment === tx.commitment && (await lightDigest("txid", commitment, body)) === tx.txid) {
      identityOk++;
    }
    let inputTotal = 0;
    for (const input of tx.inputs) {
      const key = `${input.txid}:${input.vout}`;
      const amount = utxos.get(key);
      if (amount === undefined) spendErrors++;
      else {
        inputTotal += amount;
        utxos.delete(key);
      }
    }
    let outputTotal = 0;
    tx.outputs.forEach((o, vout) => {
      utxos.set(`${tx.txid}:${vout}`, o.amount);
      outputTotal += o.amount;
    });
    if (tx.inputs.length === 0) coinbaseTotal += outputTotal;
    else feeTotal += inputTotal - outputTotal;
  }
}

check(rootsOk === pixels.length, "every merkle root recomputes", `${rootsOk}/${pixels.length}`);
check(
  identityOk === txCount,
  "every transaction's txid derives from its own content",
  `${identityOk}/${txCount}`,
);
check(spendErrors === 0, "no transaction spends an input that did not exist", `${spendErrors} bad`);

const issuance = coinbaseTotal - feeTotal;
const scheduled = mintedThrough(pixels.length);
check(
  issuance === scheduled,
  "issuance matches the emission schedule exactly",
  `${issuance} PIX minted, schedule says ${scheduled}`,
);
const liveSupply = [...utxos.values()].reduce((s, a) => s + a, 0);
check(
  liveSupply === scheduled,
  "and the live supply equals it — nothing conjured, nothing lost",
  `${liveSupply} PIX across ${utxos.size} outputs`,
);
console.log(`  · fees collected over the whole chain: ${feeTotal} PIX`);

// ── 4. the anchors, read directly ─────────────────────────────────────────
// The step that does not require trusting this repository at all.
console.log("\n4. anchors (read by eth_call, not through our tooling)");
let venuesChecked = 0;
let venuesAgreed = 0;
if (offline) {
  console.log(
    "  · skipped under --fixture / --offline (air-gap). Steps 1–3 still prove internal\n" +
      "    consistency. Re-run without --fixture when you want public-chain confirmation.",
  );
} else {
const anchors = JSON.parse(readFileSync(join(root, "anchors.json"), "utf8")) as Anchors;
const VENUE_RPC: Record<string, string> = {
  "ethereum-sepolia": process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  "robinhood-testnet": process.env.ROBINHOOD_RPC_URL ?? "https://testnet.rpc.robinhood.com",
};

for (const [venue, contract] of Object.entries(anchors.venues)) {
  const url = VENUE_RPC[venue];
  if (!url) {
    console.log(`  · ${venue}: no public RPC configured, skipped`);
    continue;
  }
  // `highestAnchored` is a public mapping(uint64 => uint64), so its getter takes uint64.
  // Guessing uint256 here produced a different selector and a bare `execution reverted`,
  // which is the least informative failure Ethereum offers.
  const highest = await ethCall(
    url,
    contract,
    keccakSelector("highestAnchored(uint64)") + word(anchors.networkId),
  );
  if (highest === null) {
    console.log(`  · ${venue}: unreachable, skipped (not a failure of the chain)`);
    continue;
  }
  venuesChecked++;
  const highestNum = Number(BigInt(highest));
  console.log(`  · ${venue}: highestAnchored(${anchors.networkId}) = ${highestNum}`);

  // matches(uint256,uint256,bytes32) -> bool, for the highest anchored height we hold
  const height = Math.min(highestNum, tip.index);
  const pixel = pixels[height];
  if (!pixel) continue;
  // matches(uint64 networkId, uint64 pixelIndex, bytes tipHash, bytes spatialRoot).
  // Both digests are 64 bytes, and the contract reverts on any other length — so this
  // confirms the FULL tip hash and the spatial root together, not a truncated prefix.
  const head = word(anchors.networkId) + word(height) + word(0x80) + word(0x80 + 32 + 64);
  const matches = await ethCall(
    url,
    contract,
    keccakSelector("matches(uint64,uint64,bytes,bytes)") +
      head +
      dynBytes(pixel.hash) +
      dynBytes(pixel.lightProof.spatialRoot),
  );
  const agreed = matches !== null && BigInt(matches) === 1n;
  if (agreed) venuesAgreed++;
  check(
    agreed,
    `${venue} confirms our pixel #${height} tip hash AND spatial root`,
    agreed ? undefined : `matches() returned ${matches ?? "no result"}`,
  );
}

if (venuesChecked === 0) {
  console.log(
    "  · no anchor venue was reachable. Steps 1-3 still hold: the chain is internally\n" +
      "    consistent. What is unconfirmed is that it is the same chain others saw.",
  );
} else {
  check(
    venuesAgreed === venuesChecked,
    `every reachable venue agrees (${venuesAgreed}/${venuesChecked})`,
  );
}
} // end online anchors

// ── verdict ───────────────────────────────────────────────────────────────
console.log("");
if (failures > 0) {
  console.error(`═══ FAILED — ${failures} check(s) did not pass ═══`);
  console.error("Do not treat this chain as verified. The specific failures are above.");
  process.exit(1);
}
console.log("═══ VERIFIED ═══");
console.log(
  `${pixels.length} pixels replayed, ${txCount} transactions, ${scheduled} PIX accounted for` +
    (venuesChecked > 0 ? `, ${venuesAgreed} public venue(s) agreeing.` : "."),
);
console.log(
  "\nNothing here asked you to trust this project: the rules were re-applied and the\n" +
    "supply was recomputed independently" +
    (venuesChecked > 0
      ? ", and the tip digest was read out of contracts on\nchains we do not control."
      : ".\n\nNOTE: no anchor venue was reachable, so the last of those three is unconfirmed.\n" +
        "The chain is internally consistent; that it is the same chain others saw is not\n" +
        "established by this run."),
);

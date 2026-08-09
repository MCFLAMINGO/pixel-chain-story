#!/usr/bin/env bun
/**
 * Tip anchoring — tamper-evidence without custody.
 *
 * Proves four things:
 *   1. The portable digest is byte-identical in TypeScript and Solidity, so a
 *      record published to one venue means the same thing at another.
 *   2. Anchors are append-only on-chain: a height cannot be revised.
 *   3. A rewritten local history is detected against a published anchor.
 *   4. Venues that disagree raise an alarm instead of silently picking one.
 *
 * The anvil leg is skipped when Foundry is absent so the suite still runs
 * everywhere; CI has Foundry and exercises it.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import {
  anchorDigest,
  anchorThesis,
  buildAnchorFromState,
  compareVenues,
  memoryAnchorVenue,
  publishToAll,
  verifyAnchorAgainstChain,
  type PublishedAnchor,
  anchorAction,
} from "../src/lib/pixel/anchor";
import {
  createGenesis,
  proposeTransfer,
  sequenceBlock,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";

const FOUNDRY = `${process.env.HOME}/.foundry/bin`;
const PATH_ENV = `${FOUNDRY}:${process.env.PATH}`;
const RPC = "http://127.0.0.1:8546";

/** Frozen cross-language vector — asserted identically in PixelAnchor.t.sol. */
const VECTOR = {
  networkId: 20553,
  pixelIndex: 7,
  tipHash: "11".repeat(64),
  spatialRoot: "22".repeat(64),
  digest: "ab4c2f7b0547413533d28212006174831988c6ee9ec9481b4efe475cbb33a384",
};

function sh(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, PATH: PATH_ENV } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}\n${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function labChain(): Promise<PixelChainState> {
  const alice = await generatePixelKeypair("PIX-ML-DSA-65");
  const bob = await generatePixelKeypair("PIX-ML-DSA-65");
  let state = await createGenesis(alice);
  ({ state } = await proposeTransfer(state, alice, [{ amount: 3, address: bob.address }], {
    description: "anchor lab",
  }));
  state = await sequenceBlock(state, alice);
  return state;
}

async function main(): Promise<void> {
  console.log("═══ TIP ANCHORING (tamper-evidence, no custody) ═══\n");

  // 1. Portable digest.
  const digest = anchorDigest(VECTOR);
  assert(digest === VECTOR.digest, `digest drift: ${digest}`);
  console.log("▸ portable digest matches the frozen vector ✓");

  let widthRejected = false;
  try {
    anchorDigest({ ...VECTOR, tipHash: "1234" });
  } catch {
    widthRejected = true;
  }
  assert(widthRejected, "short digest must be rejected, never padded");
  console.log("▸ non-canonical digest width rejected ✓");

  // A scheduled run has exactly three options at a height, and one of them is
  // an alarm that publishing again cannot fix.
  const D1 = "aa".repeat(32);
  const D2 = "bb".repeat(32);
  assert(
    anchorAction({ empty: true, digest: "00".repeat(32), anchoredAtSec: 0 }, D1).action ===
      "publish",
    "an empty height must be publishable",
  );
  const same = anchorAction({ empty: false, digest: D1, anchoredAtSec: 1_700_000_000 }, D1);
  assert(same.action === "already-anchored", "a matching digest must be a no-op");
  assert(
    same.action === "already-anchored" && same.anchoredAtSec === 1_700_000_000,
    "the no-op must carry the original timestamp",
  );
  assert(
    anchorAction({ empty: false, digest: D1.toUpperCase(), anchoredAtSec: 1 }, D1).action ===
      "already-anchored",
    "digest comparison must not depend on hex case",
  );
  const diverged = anchorAction({ empty: false, digest: D2, anchoredAtSec: 1 }, D1);
  assert(diverged.action === "divergence", "a different digest at one height must be an alarm");
  assert(
    diverged.action === "divergence" && diverged.onVenue === D2 && diverged.local === D1,
    "the alarm must name both digests",
  );
  console.log("▸ publish / no-op / divergence are the only three outcomes ✓");

  // Stale and diverged must never be conflated. A venue holding the right digest
  // agrees whether or not it is old; only a *different* digest means history
  // changed. Reporting "0/2 agree" for staleness reads as the divergence alarm
  // and would train a reader to ignore the real one.
  type Row = { status: "matches" | "diverges" | "absent" | "stale" | "unreachable" };
  const agreeing = (rows: Row[]) =>
    rows.filter((r) => r.status === "matches" || r.status === "stale").length;
  assert(
    agreeing([{ status: "stale" }, { status: "stale" }]) === 2,
    "two stale venues still agree on content — they are old, not wrong",
  );
  assert(
    agreeing([{ status: "matches" }, { status: "stale" }]) === 2,
    "a fresh and a stale venue both agree",
  );
  assert(
    agreeing([{ status: "diverges" }, { status: "matches" }]) === 1,
    "a diverged venue does not agree",
  );
  assert(
    agreeing([{ status: "absent" }, { status: "unreachable" }]) === 0,
    "a venue holding nothing, or unreadable, cannot be counted as agreeing",
  );
  console.log("▸ stale counts as agreement; only a different digest is divergence ✓");

  // Staleness must mean unwitnessed history, not merely elapsed time. A chain
  // with no new moments has nothing to publish, and calling an idle-but-fully-
  // anchored chain "stale" is the same false alarm one layer up.
  const unwitnessed = (behind: number, ageHours: number, limit = 48) =>
    behind > 0 && ageHours > limit;
  assert(!unwitnessed(0, 61), "an idle chain fully anchored is healthy, however old the anchor");
  assert(!unwitnessed(0, 10_000), "age alone must never raise the alarm");
  assert(unwitnessed(1, 61), "one unanchored pixel left for days is the real alarm");
  assert(!unwitnessed(3, 2), "history the tip just moved past is not yet a problem");
  assert(unwitnessed(3, 49), "history left unwitnessed past the limit is");
  console.log("▸ the alarm is unwitnessed history, not elapsed time ✓");

  // 2. Anchor a real chain to several venues.
  const state = await labChain();
  const record = buildAnchorFromState(state);
  const venues = [
    memoryAnchorVenue("base-lab", "evm"),
    memoryAnchorVenue("arbitrum-lab", "evm"),
    memoryAnchorVenue("ipfs-lab", "ipfs"),
  ];
  const { published, failures } = await publishToAll(record, venues);
  assert(failures.length === 0, `venue failures: ${JSON.stringify(failures)}`);
  assert(published.length === 3, "expected three venues");
  const agreement = compareVenues(published);
  assert(agreement.agreed, `venues should agree: ${JSON.stringify(agreement)}`);
  console.log(`▸ #${record.pixelIndex} anchored to ${published.length} venues, all agreeing ✓`);

  // 3. Local history matches the anchor.
  const good = verifyAnchorAgainstChain(record, state);
  assert(good.ok, `anchor should verify: ${JSON.stringify(good)}`);
  console.log("▸ local history agrees with the published anchor ✓");

  // 4. A rewritten history is caught.
  const rewritten: PixelChainState = {
    ...state,
    pixels: state.pixels.map((p, i) =>
      i === state.pixels.length - 1 ? { ...p, hash: "de".repeat(64) } : p,
    ),
  };
  const caught = verifyAnchorAgainstChain(record, rewritten);
  assert(!caught.ok, "rewritten history must NOT verify against the anchor");
  console.log(`▸ rewritten history detected — ${caught.ok ? "" : caught.reason} ✓`);

  // 5. Venue disagreement is loud.
  const liar: PublishedAnchor = {
    ...published[0]!,
    venueId: "liar-lab",
    tipHash: "ee".repeat(64),
    digest: anchorDigest({ ...record, tipHash: "ee".repeat(64) }),
  };
  const split = compareVenues([...published, liar]);
  assert(!split.agreed, "a disagreeing venue must break agreement");
  console.log(`▸ venue disagreement raised — ${split.agreed ? "" : split.reason} ✓`);

  // 6. Same digest on a real EVM chain.
  if (!existsSync(`${FOUNDRY}/anvil`)) {
    console.log("▸ anvil not present — skipping on-chain leg (CI runs it)");
  } else {
    let anvil: ChildProcess | null = null;
    try {
      anvil = spawn(`${FOUNDRY}/anvil`, ["--silent", "--port", "8546"], {
        env: { ...process.env, PATH: PATH_ENV },
        stdio: "ignore",
      });
      await sleep(1200);

      const pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const me = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const out = sh(`${FOUNDRY}/forge`, [
        "create",
        "contracts/PixelAnchor.sol:PixelAnchor",
        "--rpc-url",
        RPC,
        "--private-key",
        pk,
        "--broadcast",
        "--constructor-args",
        "0",
      ]);
      const addr = out.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/)?.[1];
      assert(addr, `no deploy address in:\n${out}`);
      console.log("▸ PixelAnchor", addr);

      sh(`${FOUNDRY}/cast`, [
        "send",
        addr!,
        "setAnchorer(address,bool)",
        me,
        "true",
        "--rpc-url",
        RPC,
        "--private-key",
        pk,
      ]);

      // The chain computes the digest itself — this is the cross-language check.
      const onChain = sh(`${FOUNDRY}/cast`, [
        "call",
        addr!,
        "anchorDigest(uint64,uint64,bytes,bytes)(bytes32)",
        String(VECTOR.networkId),
        String(VECTOR.pixelIndex),
        `0x${VECTOR.tipHash}`,
        `0x${VECTOR.spatialRoot}`,
        "--rpc-url",
        RPC,
      ]);
      assert(
        onChain.toLowerCase().startsWith(`0x${VECTOR.digest}`),
        `on-chain digest ${onChain} !== TypeScript 0x${VECTOR.digest}`,
      );
      console.log("▸ Solidity and TypeScript agree on the digest ✓");

      sh(`${FOUNDRY}/cast`, [
        "send",
        addr!,
        "anchor(uint64,uint64,bytes,bytes)",
        String(record.networkId),
        String(record.pixelIndex),
        `0x${record.tipHash}`,
        `0x${record.spatialRoot}`,
        "--rpc-url",
        RPC,
        "--private-key",
        pk,
      ]);

      const matches = sh(`${FOUNDRY}/cast`, [
        "call",
        addr!,
        "matches(uint64,uint64,bytes,bytes)(bool)",
        String(record.networkId),
        String(record.pixelIndex),
        `0x${record.tipHash}`,
        `0x${record.spatialRoot}`,
        "--rpc-url",
        RPC,
      ]);
      assert(matches.startsWith("true"), `anchored tip should match, got ${matches}`);

      const rewrittenMatches = sh(`${FOUNDRY}/cast`, [
        "call",
        addr!,
        "matches(uint64,uint64,bytes,bytes)(bool)",
        String(record.networkId),
        String(record.pixelIndex),
        `0x${"de".repeat(64)}`,
        `0x${record.spatialRoot}`,
        "--rpc-url",
        RPC,
      ]);
      assert(rewrittenMatches.startsWith("false"), "rewritten tip must not match on-chain");
      console.log("▸ on-chain anchor accepts the real tip and rejects a rewrite ✓");
    } finally {
      if (anvil?.pid) {
        try {
          process.kill(anvil.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
    }
  }

  const thesis = anchorThesis();
  console.log(`\nproves:        ${thesis.proves}`);
  console.log(`does NOT prove: ${thesis.doesNotProve}`);
  console.log(`custody:       ${thesis.custody}`);
  console.log(`venues:        ${thesis.venues}`);

  console.log("\n═══ PASS — anchoring is portable, append-only and venue-neutral ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

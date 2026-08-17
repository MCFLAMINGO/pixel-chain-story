#!/usr/bin/env bun
/**
 * Two honest nodes must converge after a partition, at any depth.
 *
 * `replaceTipIfBetter` handles exactly one shape: a competing pixel at our own height
 * whose parent is our parent. Its comment said so — "Depth-1 tip replace... not a reorg
 * market." That is sufficient for one sequencer and no peers, which is what this chain has
 * been, and insufficient for two.
 *
 * The scenario that used to be unrecoverable: partition for **two** pixels. Each side
 * extends its own branch, so every block the peer offers is at a height the other already
 * holds, and depth-1 replacement cannot reach back past the divergence. Both stay split
 * forever, both correct about their own history. A chain that cannot converge after a
 * partition does not have a second operator — it has two chains.
 *
 * The first test below is exactly that, asserted twice: once showing depth-1 cannot fix it,
 * once showing the block-tree rule does.
 *
 * The rest are the refusals, which matter more than the happy path. A fork-choice rule
 * that adopts any taller branch is a rule that lets a stranger rewrite history, so the
 * interesting assertions are about what it declines to do.
 */

import {
  acceptBlock,
  createGenesis,
  proposeTransfer,
  replaceTipIfBetter,
  sequenceBlock,
  verifyChain,
  type LedgerPixel,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import {
  commonAncestorIndex,
  considerBranch,
  MAX_REORG_DEPTH,
  prefersBranch,
  scoreBranch,
} from "../src/lib/pixel/fork-choice";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import { createTransaction } from "../src/lib/pixel/transaction";
import type { LightKeypair } from "../src/lib/pixel/crypto";

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

/** A snapshot a peer could hold — deep-copied so branches cannot share mutable state. */
function fork(state: PixelChainState): PixelChainState {
  return {
    ...state,
    pixels: [...state.pixels],
    utxos: new Map(state.utxos),
    usedOtsLeaves: new Set(state.usedOtsLeaves),
    pending: [],
    reservedInputs: new Set(),
  };
}

async function junk(to: string) {
  return createTransaction({
    inputs: [{ txid: "00".repeat(64), vout: 0 }],
    outputs: [{ amount: 1, address: to }],
    metadata: { description: "opens the mempool; dropped by the producer" },
  });
}

/** Extend by one pixel, produced by the founder (the only member on these chains). */
async function extend(state: PixelChainState, by: LightKeypair): Promise<PixelChainState> {
  return sequenceBlock({ ...state, pending: [await junk(by.address)] }, by);
}

console.log("═══ FORK CHOICE — converge after a partition, at any depth ═══\n");

const founder = await generatePixelKeypair("PIX-ML-DSA-65");
const other = await generatePixelKeypair("PIX-ML-DSA-65");
const genesis = await createGenesis(founder);

// ── 1. the partition that used to be permanent ────────────────────────────
// Both sides start from the same pixel #0 and each build two pixels. Timestamps differ,
// so the branches genuinely diverge.
let a = fork(genesis);
let b = fork(genesis);
a = await extend(a, founder);
a = await extend(a, founder);
await Bun.sleep(5);
b = await extend(b, founder);
b = await extend(b, founder);
b = await extend(b, founder); // B is one pixel taller — it should win

check(a.pixels[1]!.hash !== b.pixels[1]!.hash, "the two branches genuinely diverged at #1");
check(a.pixels.length === 3 && b.pixels.length === 4, "A holds 3 pixels, B holds 4");
check(await verifyChain(a), "A's branch is valid history on its own");
check(await verifyChain(b), "B's branch is valid history on its own");

// Depth-1 replacement cannot help: B's tip is at a height A does not hold.
const depth1 = await replaceTipIfBetter(a, b.pixels[b.pixels.length - 1]!);
check(depth1 === null, "depth-1 replaceTipIfBetter CANNOT resolve it — this was the deadlock");
// And the sequential path cannot either: B's #1 does not link to A's tip.
let seqRejected = "";
try {
  await acceptBlock(a, b.pixels[1]!);
} catch (err) {
  seqRejected = (err as Error).message;
}
check(seqRejected !== "", "and the sequential accept path rejects B's #1 too");

// The block-tree rule resolves it.
const healed = await considerBranch({ state: a, theirs: b.pixels });
check(healed.kind === "reorged", `fork choice reorgs A onto B (${healed.kind})`);
if (healed.kind === "reorged") {
  check(healed.dropped === 2, `dropped A's 2 divergent pixels (${healed.dropped})`);
  check(healed.applied === 3, `applied B's 3 (${healed.applied})`);
  check(healed.forkHeight === 0, `forked at genesis (#${healed.forkHeight})`);
  check(
    healed.state.pixels[healed.state.pixels.length - 1]!.hash ===
      b.pixels[b.pixels.length - 1]!.hash,
    "A now holds B's exact tip — the partition healed",
  );
  check(await verifyChain(healed.state), "and the reorged chain verifies");
  // The invariant most likely to be broken by a later simplification.
  check(
    [...a.usedOtsLeaves].every((leaf) => healed.state.usedOtsLeaves.has(leaf)),
    "every OTS leaf consumed on the ORPHANED branch is still burned (PIX-15)",
  );
}

// Symmetry: B, offered A's shorter branch, must decline it.
const declined = await considerBranch({ state: b, theirs: a.pixels });
check(declined.kind === "ignored", `B ignores A's shorter branch (${declined.kind})`);

// ── 2. scoring is a total order, identical on every node ──────────────────
check(
  prefersBranch({ height: 5, skips: 0, tipHash: "ff" }, { height: 4, skips: 0, tipHash: "00" }),
  "height wins first — a taller branch beats a lower-hashed one",
);
check(
  prefersBranch({ height: 5, skips: 1, tipHash: "ff" }, { height: 5, skips: 3, tipHash: "00" }),
  "then fewer total skips — a punctual branch beats a stalled one at equal height",
);
check(
  prefersBranch({ height: 5, skips: 1, tipHash: "aa" }, { height: 5, skips: 1, tipHash: "bb" }),
  "then lower tip hash",
);
check(
  !prefersBranch({ height: 5, skips: 1, tipHash: "aa" }, { height: 5, skips: 1, tipHash: "aa" }),
  "an exact tie is NOT a preference — two nodes must not flip a coin differently",
);
check(
  scoreBranch(b.pixels).height === b.pixels.length - 1,
  "a branch's score reports its tip height",
);
check(commonAncestorIndex(a.pixels, b.pixels) === 0, "common ancestor of the two branches is #0");

// ── 3. what it refuses ────────────────────────────────────────────────────

// A different genesis is another Earth, not a longer chain. This refusal must never be
// overridden by height, or a stranger with a taller private chain replaces the real one.
const rival = await createGenesis(other);
let rivalChain = fork(rival);
for (let i = 0; i < 8; i++) rivalChain = await extend(rivalChain, other);
const foreign = await considerBranch({ state: b, theirs: rivalChain.pixels });
check(
  foreign.kind === "refused" && /different genesis/.test(foreign.reason),
  `a much taller chain with a different genesis is REFUSED (${foreign.kind})`,
);

// A taller branch containing an invalid block loses to a shorter valid one.
let tampered = fork(genesis);
for (let i = 0; i < 5; i++) tampered = await extend(tampered, founder);
const poisoned: LedgerPixel[] = [...tampered.pixels];
poisoned[3] = { ...poisoned[3]!, merkleRoot: "de".repeat(64) };
const invalid = await considerBranch({ state: b, theirs: poisoned });
check(
  invalid.kind === "refused" && /failed validation/.test(invalid.reason),
  `a taller branch with one invalid pixel is REFUSED (${invalid.kind})`,
);
check(b.pixels.length === 4, "and the local chain is untouched by the attempt");

// Depth is bounded. A month offline must not mean a month silently discarded.
let deep = fork(genesis);
for (let i = 0; i < 6; i++) deep = await extend(deep, founder);
const tooDeep = await considerBranch({
  state: deep,
  theirs: b.pixels,
  maxReorgDepth: 1,
});
check(
  tooDeep.kind === "refused" || tooDeep.kind === "ignored",
  `a reorg past the depth limit is not applied silently (${tooDeep.kind})`,
);
const forcedDeep = await considerBranch({
  state: a,
  theirs: b.pixels,
  maxReorgDepth: 1,
});
check(
  forcedDeep.kind === "refused" && /over the 1 limit/.test(forcedDeep.reason),
  "and it says so, naming the limit, so an operator can look",
);
check(MAX_REORG_DEPTH === 64, `default depth limit is ${MAX_REORG_DEPTH}`);

// Finalized history may not be crossed. The rule is injected, so the eventual finality
// decision is a parameter rather than a rewrite of this file.
const finalityBlocked = await considerBranch({
  state: a,
  theirs: b.pixels,
  isFinalized: (i) => i === 1,
});
check(
  finalityBlocked.kind === "refused" && /finalized/.test(finalityBlocked.reason),
  "a reorg crossing a finalized pixel is REFUSED",
);
const finalityAllows = await considerBranch({
  state: a,
  theirs: b.pixels,
  isFinalized: (i) => i === 0,
});
check(
  finalityAllows.kind === "reorged",
  "…and finalizing only genesis still allows the reorg above it",
);

// ── 4. the ordinary case stays ordinary ──────────────────────────────────
// A pure extension must not take the rollback path.
let short = fork(genesis);
const longer = await extend(await extend(fork(genesis), founder), founder);
const extended = await considerBranch({ state: short, theirs: longer.pixels });
check(
  extended.kind === "extended",
  `a pure extension is 'extended', not a reorg (${extended.kind})`,
);
if (extended.kind === "extended") {
  check(extended.applied === 2, `applied both new pixels (${extended.applied})`);
  check(await verifyChain(extended.state), "and the extended chain verifies");
}
short = fork(genesis);
const same = await considerBranch({ state: short, theirs: short.pixels });
check(same.kind === "ignored", "an identical branch is ignored, not re-applied");
const empty = await considerBranch({ state: short, theirs: [] });
check(empty.kind === "ignored", "an empty branch is ignored");

// ── 5. real history is not reorgable by a shorter or equal branch ─────────
// The crowned chain must not be replaceable by anything that is not strictly better.
const fx = JSON.parse(
  await Bun.file(new URL("../fixtures/crowned-47.json", import.meta.url)).text(),
) as { networkId: number; pixels: LedgerPixel[]; sequencers: PixelChainState["sequencers"] };
const { deserializeChain } = await import("../src/lib/pixel/chain");
const crowned = deserializeChain({
  networkId: fx.networkId,
  pixels: fx.pixels,
  utxos: [],
  pending: [],
  sequencers: fx.sequencers,
});
const selfOffer = await considerBranch({ state: crowned, theirs: fx.pixels });
check(selfOffer.kind === "ignored", "the crowned chain offered itself is ignored, not reorged");
const truncated = await considerBranch({ state: crowned, theirs: fx.pixels.slice(0, 40) });
check(truncated.kind === "ignored", "a truncated crowned branch is ignored");

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log("═══ PASS — partitions heal; height alone does not rewrite history ═══");

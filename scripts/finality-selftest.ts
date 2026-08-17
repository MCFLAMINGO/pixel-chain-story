#!/usr/bin/env bun
/**
 * Anchored finality — and the several ways it must refuse to finalise.
 *
 * "What cannot revert" is the question every serious reader of this project asks, and the
 * honest answer was "nothing" until this module existed. So the interesting assertions here
 * are not that finality works; they are the cases where it declines to claim anything, since
 * a finality rule that over-claims is worse than none at all — it converts an unknown into a
 * false certainty.
 *
 * Read together with `fork-choice-selftest.ts`, which already proved the `isFinalized` hook
 * refuses a reorg that crosses it. This proves the thing that fills that hook in.
 */

import {
  contradictsFinality,
  finalityEnabled,
  finalityGuard,
  finalityThesis,
  finalizedThrough,
  FINALITY_MIN_CONFIRMATIONS,
  FINALITY_MIN_VENUES,
  type VenueAnchorObservation,
} from "../src/lib/pixel/finality";
import {
  considerBranch,
  createGenesis,
  sequenceBlock,
  type LedgerPixel,
  type PixelChainState,
} from "../src/lib/pixel/index";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import { createTransaction } from "../src/lib/pixel/transaction";

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

const OK = FINALITY_MIN_CONFIRMATIONS;
function obs(
  venue: string,
  pixelIndex: number,
  tipHash: string,
  confirmations = OK,
  spatialRoot = "ff".repeat(64),
): VenueAnchorObservation {
  return { venue, pixelIndex, tipHash, spatialRoot, confirmations };
}

const H = (n: number) => n.toString(16).padStart(2, "0").repeat(64);

console.log("═══ ANCHORED FINALITY — what cannot revert ═══\n");

// ── 1. off by default ─────────────────────────────────────────────────────
delete process.env.PIXEL_ANCHORED_FINALITY;
check(!finalityEnabled(), "the policy is OFF unless a network turns it on");
const guardOff = finalityGuard({
  observations: [obs("sepolia", 0, H(1)), obs("robinhood", 0, H(1))],
});
check(
  !guardOff(0),
  "with the policy off nothing is final, even when the venues agree — today's behaviour exactly",
);

process.env.PIXEL_ANCHORED_FINALITY = "1";
check(finalityEnabled(), "and ON when it is");

// ── 2. two independent venues, or nothing ─────────────────────────────────
const oneVenue = finalizedThrough({ observations: [obs("sepolia", 0, H(1))] });
check(
  oneVenue.height === -1,
  `one venue finalises nothing (min ${FINALITY_MIN_VENUES}) — a single venue is a trusted third party`,
);
const sameVenueTwice = finalizedThrough({
  observations: [obs("sepolia", 0, H(1)), obs("sepolia", 0, H(1))],
});
check(sameVenueTwice.height === -1, "the same venue reporting twice is still one venue, not two");
const twoVenues = finalizedThrough({
  observations: [obs("sepolia", 0, H(1)), obs("robinhood", 0, H(1))],
});
check(twoVenues.height === 0, "two independent venues agreeing finalises the height");

// ── 3. confirmations must be real ─────────────────────────────────────────
const shallow = finalizedThrough({
  observations: [obs("sepolia", 0, H(1), OK - 1), obs("robinhood", 0, H(1), OK)],
});
check(
  shallow.height === -1,
  `a venue below ${FINALITY_MIN_CONFIRMATIONS} confirmations does not count — an unconfirmed anchor can vanish`,
);
const zero = finalizedThrough({
  observations: [obs("sepolia", 0, H(1), 0), obs("robinhood", 0, H(1), 0)],
});
check(zero.height === -1, "…and zero confirmations certainly does not");

// ── 4. disagreement is refused, never resolved ────────────────────────────
// The case that matters most. Two venues carrying different digests for one height means
// something has gone badly wrong; quietly picking a winner would turn a loud contradiction
// into a silent decision.
const disagree = finalizedThrough({
  observations: [obs("sepolia", 0, H(1)), obs("robinhood", 0, H(2))],
});
check(disagree.height === -1, "venues disagreeing about a digest finalises NOTHING");
check(
  disagree.venueDisagreements.includes(0),
  "…and the disagreement is reported by height, so an operator can look",
);
const partialDisagree = finalizedThrough({
  observations: [
    obs("sepolia", 0, H(1)),
    obs("robinhood", 0, H(1)),
    obs("sepolia", 1, H(3)),
    obs("robinhood", 1, H(4)),
  ],
});
check(
  partialDisagree.height === 0,
  "a disagreement at #1 does not un-finalise the agreed #0 below it",
);

// A differing spatialRoot with a matching tipHash is still a disagreement: the anchor
// commits to both, so half a match is a mismatch.
const spatialMismatch = finalizedThrough({
  observations: [
    obs("sepolia", 0, H(1), OK, "aa".repeat(64)),
    obs("robinhood", 0, H(1), OK, "bb".repeat(64)),
  ],
});
check(
  spatialMismatch.height === -1,
  "a matching tip hash with a differing spatial root is still a disagreement",
);

// ── 5. finality is a prefix property ──────────────────────────────────────
// A gap means an anchor was missed. Finalising past it would finalise history nobody
// witnessed, on the strength of a later height that happens to be anchored.
const gap = finalizedThrough({
  observations: [
    obs("sepolia", 0, H(1)),
    obs("robinhood", 0, H(1)),
    obs("sepolia", 5, H(5)),
    obs("robinhood", 5, H(5)),
  ],
});
check(gap.height === 0, "a gap stops finality at the last unbroken height, not the highest");
check(gap.checkpoints.length === 2, "…while still recording both checkpoints it saw");

const run = finalizedThrough({
  observations: [0, 1, 2, 3].flatMap((i) => [
    obs("sepolia", i, H(i + 1)),
    obs("robinhood", i, H(i + 1)),
  ]),
});
check(run.height === 3, "an unbroken run finalises through its top (#3)");

// ── 6. a contradicting branch is identified ───────────────────────────────
const checkpoints = run.checkpoints;
const honestBranch = [0, 1, 2, 3].map((i) => ({ index: i, hash: H(i + 1) }));
check(
  !contradictsFinality({ branch: honestBranch, checkpoints }).contradicts,
  "a branch matching every checkpoint does not contradict finality",
);
const rewritten = [...honestBranch];
rewritten[2] = { index: 2, hash: H(99) };
const conflict = contradictsFinality({ branch: rewritten, checkpoints });
check(conflict.contradicts && conflict.atIndex === 2, "a rewritten pixel is caught, at #2");
check(
  conflict.expected === H(3) && conflict.found === H(99),
  "…and both the witnessed and the offered digest are reported",
);
const shortBranch = honestBranch.slice(0, 2);
check(
  !contradictsFinality({ branch: shortBranch, checkpoints }).contradicts,
  "a branch that simply does not reach a checkpoint does not contradict it",
);

// ── 7. it actually stops a reorg, end to end ──────────────────────────────
// fork-choice-selftest proved the hook refuses. This proves the hook filled in by real
// observations refuses the same way, which is the join between the two modules.
const founder = await generatePixelKeypair("PIX-ML-DSA-65");
const genesis = await createGenesis(founder);
const junk = async () =>
  createTransaction({
    inputs: [{ txid: "00".repeat(64), vout: 0 }],
    outputs: [{ amount: 1, address: founder.address }],
    metadata: { description: "opens the mempool" },
  });
const forkState = (s: PixelChainState): PixelChainState => ({
  ...s,
  pixels: [...s.pixels],
  utxos: new Map(s.utxos),
  usedOtsLeaves: new Set(s.usedOtsLeaves),
  pending: [],
  reservedInputs: new Set(),
});

let a = forkState(genesis);
a = await sequenceBlock({ ...a, pending: [await junk()] }, founder);
a = await sequenceBlock({ ...a, pending: [await junk()] }, founder);
await Bun.sleep(5);
let b = forkState(genesis);
b = await sequenceBlock({ ...b, pending: [await junk()] }, founder);
b = await sequenceBlock({ ...b, pending: [await junk()] }, founder);
b = await sequenceBlock({ ...b, pending: [await junk()] }, founder);

check(a.pixels[1]!.hash !== b.pixels[1]!.hash, "two branches diverge at #1 (b is taller)");

// Without finality, B wins on height — that is T3.1's rule and it is correct.
const noFinality = await considerBranch({ state: a, theirs: b.pixels });
check(noFinality.kind === "reorged", "without finality the taller branch wins, as T3.1 says");

// With A's #1 witnessed by two venues, B's taller branch is refused.
const witnessed: VenueAnchorObservation[] = [
  obs("sepolia", 0, a.pixels[0]!.hash),
  obs("robinhood", 0, a.pixels[0]!.hash),
  obs("sepolia", 1, a.pixels[1]!.hash),
  obs("robinhood", 1, a.pixels[1]!.hash),
];
const guard = finalityGuard({ observations: witnessed });
check(guard(1) && !guard(2), "the guard finalises through #1 and no further");
const blocked = await considerBranch({
  state: a,
  theirs: b.pixels,
  isFinalized: guard,
});
check(
  blocked.kind === "refused" && /finalized/.test(blocked.reason),
  `a taller branch contradicting a witnessed pixel is REFUSED (${blocked.kind})`,
);
check(
  a.pixels.length === 3 && a.pixels[1]!.hash === witnessed[2]!.tipHash,
  "and the local chain still holds the witnessed history",
);

// The honest converse: a taller branch that AGREES with the checkpoints is still adopted.
// Finality must restrict reorgs, not freeze the chain.
let c = forkState(a);
c = await sequenceBlock({ ...c, pending: [await junk()] }, founder);
const extension = await considerBranch({ state: a, theirs: c.pixels, isFinalized: guard });
check(
  extension.kind === "extended",
  `a branch that extends the witnessed history is still adopted (${extension.kind})`,
);

// ── 8. the thesis says what it is not ─────────────────────────────────────
const t = finalityThesis();
check(/Not BFT/.test(t.isNot), "the thesis states plainly that this is not BFT");
check(
  /does NOT prove the anchored root was correct/.test(t.inheritedLimit),
  "…and inherits the anchors' honest limit rather than over-reading it",
);
check(/ceremony/.test(t.policy), "…and says enabling it on a live chain is a ceremony");

delete process.env.PIXEL_ANCHORED_FINALITY;

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log("═══ PASS — finality claims little, and refuses to claim more ═══");

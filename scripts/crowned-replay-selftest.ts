#!/usr/bin/env bun
/**
 * The crowned Earth must still verify.
 *
 * Every other selftest asks "does the rule work?" on a chain it just forged. This
 * one asks the question that actually decides whether a consensus change may ship:
 * **does real history still pass?** The fixture is the public tip as it stood at
 * pixel #46 — 47 pixels, 93 transactions, 2,350 PIX, five people on three
 * continents, including transfers that matter to the person who made them.
 *
 * A tightening that would orphan any of that is not a fix, and this file is where
 * it gets caught. So this test runs before every consensus change lands, not after,
 * and it is the one gate in the soundness list that never moves.
 *
 * It also does something less obvious on purpose: it asserts the *preconditions*
 * of tightenings that have not shipped yet. Real history already satisfies every
 * rule Phase 1 introduces — that is why Phase 1 needs no fork — and stating each
 * one here, ahead of the change, is what turns "should be safe" into a measurement.
 * When a task lands, its precondition here stops being a forecast and becomes a
 * regression test, unchanged.
 */

import {
  deserializeChain,
  electableAt,
  verifyChain,
  type LedgerPixel,
  type SequencerId,
} from "../src/lib/pixel/chain";
import {
  CROWNED_GENESIS_HASH,
  CROWNED_NETWORK_ID,
  isCrownedGenesisHash,
} from "../src/lib/pixel/crowned-genesis";
import { mintedThrough, lightReward } from "../src/lib/pixel/economics";
import { canonicalTxBody } from "../src/lib/pixel/transaction";
import { lightDigest } from "../src/lib/pixel/light-digest";
import { merkleRoot } from "../src/lib/pixel/pol";

interface Fixture {
  capturedAt: string;
  source: string;
  networkId: number;
  genesisHash: string;
  tip: number;
  tipHash: string;
  sequencers: SequencerId[];
  pixels: LedgerPixel[];
}

/**
 * Checks known to fail, with the reason, so CI stays honest without staying red.
 *
 * A known gap is not a passing test. It prints loudly, it names its cause, and
 * the only acceptable direction for this set is empty. Borrowed from the
 * typecheck ratchet: a ceiling you may lower and must never raise.
 */
const KNOWN_GAPS = new Map<string, string>([
  // Empty, and the only acceptable direction. Add an entry only with a reason and a
  // named fix in flight; delete it in the commit that lands the fix.
]);

let failures = 0;
let gaps = 0;
function check(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`▸ ${msg} ✓`);
    if (KNOWN_GAPS.has(msg)) {
      console.error(
        `✗ ${msg} — listed as a KNOWN GAP but it passes. Delete the entry; a stale ` +
          `exemption hides the next regression.`,
      );
      failures++;
    }
    return;
  }
  const gap = KNOWN_GAPS.get(msg);
  if (gap) {
    console.error(`⚠ KNOWN GAP — ${msg}\n    ${gap}`);
    gaps++;
    return;
  }
  console.error(`✗ ${msg}`);
  failures++;
}

console.log("═══ CROWNED REPLAY — real history must still verify ═══\n");

const raw = await Bun.file(new URL("../fixtures/crowned-47.json", import.meta.url)).text();
const fixture = JSON.parse(raw) as Fixture;
const { pixels } = fixture;

console.log(
  `fixture: ${pixels.length} pixels, captured ${fixture.capturedAt}\n` +
    `         from ${fixture.source}\n`,
);

// ── identity ───────────────────────────────────────────────────────────────
check(fixture.networkId === CROWNED_NETWORK_ID, `network is the crowned ${CROWNED_NETWORK_ID}`);
check(isCrownedGenesisHash(fixture.genesisHash), "genesis is the crowned Earth");
check(pixels[0]?.hash === CROWNED_GENESIS_HASH, "genesis pixel hash matches the ceremony hash");
check(pixels.length === 47, `47 pixels (tip #${fixture.tip})`);
check(pixels[pixels.length - 1]?.hash === fixture.tipHash, "tip hash matches the captured tip");

// ── the whole point: it verifies ────────────────────────────────────────────
const state = deserializeChain({
  networkId: fixture.networkId,
  pixels,
  utxos: [],
  pending: [],
  sequencers: fixture.sequencers,
});
check(await verifyChain(state), "verifyChain accepts real history");

// ── monetary facts, independently replayed ─────────────────────────────────
let coinbaseTotal = 0;
let txCount = 0;
let feeTotal = 0;
for (const pixel of pixels) {
  for (const tx of pixel.transactions) {
    txCount++;
    if (tx.inputs.length === 0) {
      const minted = tx.outputs.reduce((s, o) => s + o.amount, 0);
      coinbaseTotal += minted;
      // Every coinbase is exactly the schedule, so no fee has ever been paid.
      feeTotal += minted - lightReward(pixel.index);
    }
  }
}
check(txCount === 93, `93 transactions (got ${txCount})`);
check(coinbaseTotal === 2350, `2,350 PIX in existence (got ${coinbaseTotal})`);
check(
  coinbaseTotal === mintedThrough(pixels.length),
  "issuance equals the emission schedule exactly",
);
check(feeTotal === 0, "no fee has ever been collected (T1.4 is a no-op on real history)");

// ── preconditions for Phase 1 tightenings ─────────────────────────────────
// Each of these is a rule that does not exist yet. Real history already obeys it,
// which is the measured reason Phase 1 needs no hard fork.

check(
  pixels.every((p) => p.sequence === p.index),
  "T1.2 — sequence === index on every pixel",
);
check(
  pixels.every((p, i) => i === 0 || p.sequence === pixels[i - 1]!.sequence + 1),
  "T1.2 — sequence advances by exactly one",
);
check(
  pixels.every((p) => p.lightProof.sequence === p.sequence),
  "T1.2 — lightProof.sequence === block.sequence",
);
check(
  pixels.every((p) => p.lightProof.prevHash === p.prevHash),
  "T1.10 — lightProof.prevHash === block.prevHash",
);
check(
  pixels.every((p) => p.lightProof.scheme != null),
  "T1.10 — every light proof declares its scheme (no silent default)",
);

// Membership: every bound electable set is exactly the founding producer, so a
// fold seeded at genesis with no join records reproduces all 47 sets byte for byte.
const founder = pixels[0]!.lightProof.sequencerAddress;
check(
  pixels.every(
    (p) => (p.lightProof.electable ?? []).length === 1 && p.lightProof.electable![0] === founder,
  ),
  "T1.1 — every bound electable set is exactly the founding producer",
);
check(
  pixels.every((p) => p.lightProof.sequencerAddress === founder),
  "T1.1 — one producer signed all 47 pixels",
);

// The load-bearing one: the membership fold must reproduce every bound electable set
// byte for byte. This is what makes T1.1 a tightening rather than a fork — if the
// fold disagreed with history anywhere, the real chain would stop validating.
const foldMismatches = pixels
  .map((p, i) => ({
    index: i,
    bound: (p.lightProof.electable ?? []).join("|"),
    folded: electableAt(state, i).join("|"),
  }))
  .filter((r) => r.bound !== r.folded);
check(
  foldMismatches.length === 0,
  `T1.1 — the membership fold reproduces all ${pixels.length} bound electable sets` +
    (foldMismatches.length
      ? ` (first mismatch at #${foldMismatches[0]!.index}: bound ${foldMismatches[0]!.bound} vs folded ${foldMismatches[0]!.folded})`
      : ""),
);
check(
  pixels.every((p) => p.membership == null || p.membership.length === 0),
  "T1.1 — no pixel carries a membership record, so the fold is the founder throughout",
);
check(
  pixels.every((p) => p.lightProof.membershipDigest == null),
  "T1.1 — no light proof binds a membership digest, so the PoLS preimage is unchanged",
);
check(
  pixels.every((p) => (p.lightProof.skipCount ?? 0) === 0),
  "T1.1 — no pixel was produced on a skip",
);

// Transaction identity must be recomputable from content, or T1.3 would orphan it.
let identityOk = 0;
for (const pixel of pixels) {
  for (const tx of pixel.transactions) {
    const body = canonicalTxBody(tx);
    const commitment = await lightDigest("superposition", body);
    const txid = await lightDigest("txid", commitment, body);
    if (commitment === tx.commitment && txid === tx.txid) identityOk++;
  }
}
check(identityOk === txCount, `T1.3 — all ${txCount} transactions recompute txid + commitment`);

// Merkle roots must recompute, independently of verifyChain.
let rootsOk = 0;
for (const pixel of pixels) {
  if ((await merkleRoot(pixel.transactions.map((t) => t.txid))) === pixel.merkleRoot) rootsOk++;
}
check(rootsOk === pixels.length, "merkle root recomputes on every pixel");

// Privacy must be signable: T1.10 adds it to the signed body, which is only safe
// if every live transaction carries the value the field defaults to.
check(
  pixels.every((p) => p.transactions.every((t) => t.privacy === "public")),
  "T1.10 — every live transaction is privacy: public",
);

// Metadata must survive a strict schema: T1.8 removes .passthrough().
const KNOWN_META = new Set(["description", "recipientLabel", "reference", "kind"]);
const unknownKeys = new Set<string>();
let maxMetaBytes = 0;
for (const pixel of pixels) {
  for (const tx of pixel.transactions) {
    for (const k of Object.keys(tx.metadata ?? {})) {
      if (!KNOWN_META.has(k)) unknownKeys.add(k);
    }
    maxMetaBytes = Math.max(maxMetaBytes, JSON.stringify(tx.metadata ?? {}).length);
  }
}
check(
  unknownKeys.size === 0,
  `T1.8 — no transaction carries an unknown metadata key${
    unknownKeys.size ? ` (found ${[...unknownKeys].join(", ")})` : ""
  }`,
);
check(maxMetaBytes <= 1024, `T1.8 — largest metadata object is ${maxMetaBytes} bytes`);

// Bounds must be roomy enough that real traffic never touched them.
const maxTxs = Math.max(...pixels.map((p) => p.transactions.length));
check(maxTxs <= 64, `T1.8 — busiest pixel carries ${maxTxs} transactions, far under any cap`);

// Lifecycle parity: acceptBlock is about to require what verifyChain already does.
check(
  pixels.every((p) => p.transactions.every((t) => t.state === "final" || t.state === "revealed")),
  "T1.6 — every transaction is final or revealed",
);

// Body arrays must be reproducible, or T1.9 would orphan them. verifyChain already
// checks their digests; T1.9 compares the arrays themselves, so assert they exist
// in the shape the recomputation produces.
check(
  pixels.every((p) => Array.isArray(p.field)),
  "T1.9 — every pixel carries a field witness array",
);
check(
  pixels.every((p) => p.index === 0 || Array.isArray(p.wave)),
  "T1.9 — every non-genesis pixel carries a wave hit array",
);

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed against real history ═══`);
  process.exit(1);
}
if (gaps > 0) {
  console.log(`═══ PASS with ${gaps} KNOWN GAP(S) — see the list above ═══`);
  process.exit(0);
}
console.log("═══ PASS — the crowned Earth verifies, and Phase 1 will not orphan it ═══");

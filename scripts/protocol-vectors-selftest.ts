#!/usr/bin/env bun
/**
 * The committed protocol vectors must be exactly what the code produces.
 *
 * `SPEC.md` §2.1 pins the constants and `test:spec-conformance` checks them. This pins the
 * **bytes** — every preimage, digest, message and a whole valid pixel — and checks those.
 *
 * Two directions, both of which matter:
 *
 *   - the code drifts from the vectors → a released implementation just changed its wire
 *     format, and every other implementation forked. This is the direction that will
 *     matter once there is a second client.
 *   - the vectors drift from the code → somebody regenerated them to make a failure go
 *     away, which is how a "known-answer test" stops answering anything.
 *
 * The check is a byte comparison of the regenerated file against the committed one, so
 * both directions are the same assertion and neither can be argued with.
 *
 * There is a real cost to that strictness: any legitimate protocol change requires
 * `bun run vectors:write` in the same commit. That is the point. A change to a preimage
 * *should* be impossible to make quietly.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildVectors } from "./vectors-generate";
import { deserializeChain, verifyChain, type LedgerPixel } from "../src/lib/pixel/chain";
import { canonicalTxBody, type Transaction } from "../src/lib/pixel/transaction";
import { lightDigest } from "../src/lib/pixel/light-digest";
import { merkleRoot, verifyMerkleProof } from "../src/lib/pixel/pol";

const root = join(import.meta.dir, "..");
const VECTORS = join(root, "fixtures/vectors/protocol-v1.json");

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

console.log("═══ PROTOCOL VECTORS — the bytes are pinned ═══\n");

const committedRaw = readFileSync(VECTORS, "utf8");
// Vectors are a language-neutral document, so the shape is read defensively rather than
// mirrored as a type — a type here would be a second, silently-diverging schema.
const committed = JSON.parse(committedRaw) as Record<string, Record<string, never>> &
  Record<string, { [k: string]: unknown }>;

// ── 1. regeneration must reproduce the committed file exactly ─────────────
const regeneratedRaw = JSON.stringify(await buildVectors(), null, 2) + "\n";
if (regeneratedRaw === committedRaw) {
  console.log("▸ regenerating the vectors reproduces the committed file byte for byte ✓");
} else {
  // Point at the first divergence rather than dumping 84 KB of JSON.
  const a = committedRaw.split("\n");
  const b = regeneratedRaw.split("\n");
  let line = 0;
  while (line < Math.min(a.length, b.length) && a[line] === b[line]) line++;
  console.error("✗ regenerating the vectors does NOT reproduce the committed file");
  console.error(`    first divergence at line ${line + 1}:`);
  console.error(`      committed:   ${(a[line] ?? "<end of file>").slice(0, 150)}`);
  console.error(`      regenerated: ${(b[line] ?? "<end of file>").slice(0, 150)}`);
  console.error(
    "    Either a preimage changed (then say so, and run `bun run vectors:write` in the " +
      "same commit), or generation is not deterministic (then fix that first — a vector " +
      "that cannot be reproduced is not a vector).",
  );
  failures++;
}

// ── 2. the vectors are internally true ────────────────────────────────────
// Regeneration matching proves the file is what the code emits. These prove the code was
// right, by recomputing a few of the recipes the file itself documents.

const ti = committed.transactionIdentity;
check(
  (await lightDigest("superposition", ti.canonicalTxBody)) === ti.commitment,
  'commitment is lightDigest("superposition", canonicalTxBody), as the vector claims',
);
check(
  (await lightDigest("txid", ti.commitment, ti.canonicalTxBody)) === ti.txid,
  'txid is lightDigest("txid", commitment, canonicalTxBody)',
);
check(
  ti.signedMessage === `${ti.commitment}|${ti.canonicalTxBody}`,
  "the signed message is `${commitment}|${canonicalTxBody}`",
);
check(
  !ti.canonicalTxBody.includes('"privacy"') && !ti.canonicalTxBody.includes('"state"'),
  "privacy and state are NOT in the signed body — a second implementation must not add them",
);

check(
  (await merkleRoot(committed.merkle.leaves)) === committed.merkle.root,
  "the merkle root recomputes from the vector's own leaves",
);
check(
  await verifyMerkleProof({
    leaf: committed.merkle.leaves[1],
    index: 1,
    path: committed.merkle.proofForIndex1,
    root: committed.merkle.root,
    leafCount: committed.merkle.leaves.length,
  }),
  "the recorded inclusion proof verifies against the recorded root",
);

// The optional PoLS segments are the compatibility mechanism, so assert their shape.
check(
  !committed.pols.messageWithoutOptionalSegments.includes("el="),
  "polsMessage omits `el=` entirely when there is no electable set",
);
check(
  committed.pols.messageWithElectable.includes("el="),
  "…and includes it when there is one — this is why old proofs still verify",
);
check(
  committed.pols.messageFull.includes("members="),
  "the full message carries `members=` when membership changes",
);
check(
  committed.pols.selected === committed.pols.electable[0] ||
    committed.pols.selected === committed.pols.electable[1],
  "the lottery selects a member of the electable set it was given",
);

// The membership fold is the rule most likely to be implemented subtly wrong.
const fold = committed.membership.foldAtHeights;
const delay = committed.membership.activationDelay;
check(fold["5"].length === 1, "at the height of inclusion the joiner is NOT yet electable");
check(
  fold[String(5 + delay - 1)].length === 1,
  `still not electable one pixel before activation (+${delay})`,
);
check(fold[String(5 + delay)].length === 2, `electable exactly at +${delay}`);
check(
  committed.membership.possessionMessage !== committed.membership.authorizationMessage,
  "possession and authorization sign different messages — one cannot stand in for the other",
);
check(
  committed.membership.possessionMessage.endsWith(committed.membership.claim) &&
    committed.membership.authorizationMessage.endsWith(committed.membership.claim),
  "…over the same claim, so neither can be replayed against a different one",
);

check(committed.emission.scheduleTotalEqualsCap === true, "the schedule reaches the cap exactly");
check(
  committed.emission.rewardAt["0"] === committed.emission.rewardAt["210000"],
  "the reward does not halve at 210,000 — the fossil boundary",
);
check(
  committed.emission.rewardAt[String(committed.emission.horizonPixels)] === 0,
  "and stops at the horizon",
);

check(
  committed.eras.eraAt[`${committed.eras.crownedNetworkId}@0`] === "legacy-pre-ctx",
  "genesis on the crowned network is legacy era",
);
check(
  committed.eras.eraAt[
    `${committed.eras.crownedNetworkId}@${committed.eras.legacyEraEndHeight}`
  ] === "current",
  "and the boundary height is current era",
);
check(committed.eras.eraAt["20556@0"] === "current", "a lab network has no legacy era at all");

// ── 3. the recorded pixel is genuinely valid ─────────────────────────────
// The end-to-end target. If an implementation can accept this, it has the acceptance rule.
const blockVec = committed.block;
check(blockVec.chainVerifies === true, "the vector records that its own chain verifies");
check(
  blockVec.networkId !== committed.eras.crownedNetworkId,
  "the vector chain is NOT on the crowned network — its blocks are current-era signed",
);

const chain = deserializeChain({
  networkId: blockVec.networkId,
  pixels: [blockVec.genesis as LedgerPixel, blockVec.pixel as LedgerPixel],
  utxos: [],
  pending: [],
  sequencers: [
    {
      address: (blockVec.genesis as LedgerPixel).lightProof.sequencerAddress,
      publicKey: (blockVec.genesis as LedgerPixel).lightProof.sequencerPublicKey,
    },
  ],
});
check(await verifyChain(chain), "and re-verifying it from the vector file alone confirms that");

const pixel = blockVec.pixel as LedgerPixel;
check(
  (await merkleRoot(pixel.transactions.map((t) => t.txid))) === pixel.merkleRoot,
  "the recorded pixel's merkle root recomputes",
);
let identityOk = 0;
for (const tx of pixel.transactions as Transaction[]) {
  const body = canonicalTxBody(tx);
  const commitment = await lightDigest("superposition", body);
  if (commitment === tx.commitment && (await lightDigest("txid", commitment, body)) === tx.txid) {
    identityOk++;
  }
}
check(
  identityOk === pixel.transactions.length,
  `every transaction in the recorded pixel recomputes its identity (${identityOk}/${pixel.transactions.length})`,
);
check(
  pixel.transactions.every((t) => (t as Transaction).revealedAt === 0),
  "display clocks are normalized to 0 — they are outside consensus and outside the digest",
);

// ── 4. the documentation exists and points at the right things ───────────
const doc = readFileSync(join(root, "docs/VECTORS.md"), "utf8");
for (const section of ["transactionIdentity", "pols", "membership", "block"]) {
  check(doc.includes(section), `docs/VECTORS.md documents the \`${section}\` section`);
}
check(
  doc.includes("vectors:write"),
  "docs/VECTORS.md says how to regenerate, since that is the only sanctioned way to change them",
);

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log("═══ PASS — a second implementation has something to aim at ═══");

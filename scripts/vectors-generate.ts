#!/usr/bin/env bun
/**
 * Generate `fixtures/vectors/protocol-v1.json` — the artifact a second implementation is
 * built against.
 *
 * ## Why this exists
 *
 * "As robust as Ethereum" rests on something specific and unglamorous: a specification
 * precise enough that somebody can write a second client without reading the first one,
 * and vectors precise enough to tell them when they have got it wrong. Pixel has one
 * TypeScript implementation. Until there is a second, "the protocol" and "what this code
 * does" are the same sentence, and no amount of internal testing can separate them.
 *
 * `SPEC.md` §2.1 pins the constants. This pins the *bytes*.
 *
 * ## What it deliberately captures
 *
 * The exact **string preimages**, not only the digests. Every silent divergence this
 * project has actually suffered was a preimage disagreement:
 *
 *   - `c8d5d54` moved ML-DSA domain separation from a message prefix into the FIPS-204
 *     ctx parameter and thirteen pixels stopped verifying
 *   - a zod schema rebuilt transaction objects in declaration order, changed the JSON,
 *     and broke every signature on the wire
 *
 * Both would have been caught instantly by a vector that records the string being hashed
 * rather than only the hash. A second implementation that produces the right digest from
 * the wrong preimage is a second implementation that will fork later, on a case nobody
 * tested.
 *
 * ## Determinism
 *
 * Every input is fixed: seeds, timestamps, `PIXEL_DETERMINISTIC_SIG=1`. Run it twice and
 * the file is identical — `scripts/protocol-vectors-selftest.ts` asserts that the
 * committed file is exactly what regeneration produces, so a drift in any preimage fails
 * the build rather than quietly rewriting the vectors.
 *
 *   bun run vectors:write     regenerate (only when the protocol legitimately changes)
 *   bun run test:protocol-vectors   verify the committed file still matches
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  createGenesis,
  electableAt,
  PIXEL_LAB_NETWORK_ID,
  proposeTransfer,
  sequenceBlock,
  verifyChain,
  type LedgerPixel,
} from "../src/lib/pixel/chain";
import {
  GENESIS_LIGHT_REWARD,
  LIGHT_HORIZON,
  PIX_HARD_CAP,
  lightReward,
  mintedThrough,
} from "../src/lib/pixel/economics";
import { sha512Hex, sha512SyncHex } from "../src/lib/pixel/crypto";
import { lightDigest } from "../src/lib/pixel/light-digest";
import {
  electableCommitment,
  merkleRoot,
  merkleProof,
  polsMessage,
  selectSequencer,
  selectSequencerWithSkip,
} from "../src/lib/pixel/pol";
import { opticalBeacon } from "../src/lib/pixel/optical";
import { addressForScheme, generatePixelKeypair, signPixel } from "../src/lib/pixel/scheme";
import { canonicalTxBody, createTransaction } from "../src/lib/pixel/transaction";
import {
  MEMBERSHIP_ACTIVATION_DELAY,
  authorizationMessage,
  createSequencerJoin,
  membersAt,
  membershipClaim,
  possessionMessage,
} from "../src/lib/pixel/membership";
import { computeFieldDigest, buildFieldWitnesses } from "../src/lib/pixel/field-witness";
import { computeTipWaveField } from "../src/lib/pixel/wave";
import { buildSpatialPicture } from "../src/lib/pixel/spatial-picture";
import { LEGACY_SIG_ERA_END_HEIGHT, sigEraFor } from "../src/lib/pixel/sig-era";
import { CROWNED_NETWORK_ID } from "../src/lib/pixel/crowned-genesis";

/** Frozen inputs. Changing any of these changes every vector below it. */
const SEED_A = "11".repeat(32);
const SEED_B = "22".repeat(32);
const T0 = 1_700_000_000_000;

export async function buildVectors(): Promise<Record<string, unknown>> {
  // Known-answer mode: production signing is hedged, vectors must not be.
  process.env.PIXEL_DETERMINISTIC_SIG = "1";

  const hexToBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));
  const alice = await generatePixelKeypair("PIX-ML-DSA-65", hexToBytes(SEED_A));
  const bob = await generatePixelKeypair("PIX-ML-DSA-65", hexToBytes(SEED_B));

  // ── digests ────────────────────────────────────────────────────────────
  const digests = {
    note: "Domain-separated digests. The domain string is part of the preimage.",
    sha512Hex: { input: "pixel", output: await sha512Hex("pixel") },
    sha512SyncHex: { input: "pixel", output: sha512SyncHex("pixel") },
    lightDigest: {
      superposition: {
        parts: ["superposition", "body"],
        output: await lightDigest("superposition", "body"),
      },
      txid: { parts: ["txid", "c", "body"], output: await lightDigest("txid", "c", "body") },
    },
  };

  // ── addresses ──────────────────────────────────────────────────────────
  const addresses = {
    note: "An address is a commitment to a master public key UNDER a named scheme. The same key bytes under a different scheme give a different address.",
    "PIX-ML-DSA-65": {
      seed: SEED_A,
      publicKey: alice.publicKey,
      address: alice.address,
      derived: await addressForScheme(alice.publicKey, "PIX-ML-DSA-65"),
    },
  };

  // ── transaction identity ───────────────────────────────────────────────
  const tx = await createTransaction({
    inputs: [{ txid: "ab".repeat(64), vout: 1 }],
    outputs: [{ amount: 7, address: bob.address }],
    metadata: { description: "vector transfer", reference: "VEC-1" },
    timestamp: T0,
  });
  const txBody = canonicalTxBody(tx);
  const transactionIdentity = {
    note: "canonicalTxBody is the EXACT JSON string that is hashed and signed. Key order is significant: an implementation that serializes these fields in another order produces a different txid and will fork. Note that `privacy` and `state` are NOT in the body.",
    canonicalTxBody: txBody,
    commitment: tx.commitment,
    txid: tx.txid,
    commitmentRecipe: 'lightDigest("superposition", canonicalTxBody)',
    txidRecipe: 'lightDigest("txid", commitment, canonicalTxBody)',
    signedMessage: `${tx.commitment}|${txBody}`,
    signedMessageRecipe: "`${commitment}|${canonicalTxBody}`",
  };

  // ── merkle ─────────────────────────────────────────────────────────────
  const leaves = ["aa".repeat(64), "bb".repeat(64), "cc".repeat(64)];
  const merkle = {
    note: "Odd layers duplicate the last leaf. Pair preimage is `${left}|${right}`.",
    leaves,
    root: await merkleRoot(leaves),
    emptyRoot: await merkleRoot([]),
    singleRoot: await merkleRoot([leaves[0]!]),
    proofForIndex1: await merkleProof(leaves, 1),
  };

  // ── PoLS ───────────────────────────────────────────────────────────────
  const prevHash = "cd".repeat(64);
  const lotteryAddrs = [alice.address, bob.address].sort();
  const beacon = await opticalBeacon(3, prevHash);
  const pols = {
    note: "The lottery is argmin over sha512(pols-lottery|prevHash|sequence|address). polsMessage is the exact string signed; the optional segments (el=, members=) appear ONLY when their inputs are present, which is what keeps older proofs verifiable.",
    lotteryPreimage: `pols-lottery|${prevHash}|3|${alice.address}`,
    lotteryScore: sha512SyncHex(`pols-lottery|${prevHash}|3|${alice.address}`),
    electable: lotteryAddrs,
    electableCommitmentPreimage: `pols-electable|${lotteryAddrs.join("|")}`,
    electableCommitment: electableCommitment(lotteryAddrs),
    selected: selectSequencer(prevHash, 3, lotteryAddrs),
    selectedSkip1: selectSequencerWithSkip(prevHash, 3, lotteryAddrs, 1),
    beaconRecipe: "opticalBeacon(sequence, prevHash)",
    beacon,
    messageWithoutOptionalSegments: polsMessage(3, prevHash, beacon, alice.address, 0),
    messageWithElectable: polsMessage(3, prevHash, beacon, alice.address, 0, lotteryAddrs),
    messageFull: polsMessage(
      3,
      prevHash,
      beacon,
      alice.address,
      0,
      lotteryAddrs,
      "11".repeat(64),
      "22".repeat(64),
      "33".repeat(64),
      "44".repeat(64),
    ),
  };

  // ── membership ─────────────────────────────────────────────────────────
  const claimFields = {
    kind: "sequencer-join" as const,
    address: bob.address,
    publicKey: bob.publicKey,
    scheme: "PIX-ML-DSA-65" as const,
    includedAt: 5,
    authorizedBy: alice.address,
  };
  const joinRecord = await createSequencerJoin({
    joiner: { address: bob.address, publicKey: bob.publicKey, scheme: "PIX-ML-DSA-65" },
    authorizer: { address: alice.address },
    includedAt: 5,
    sign: (message, who) => signPixel(message, who === "joiner" ? bob : alice),
  });
  const foldRecords = (index: number) => (index === 5 ? [joinRecord] : undefined);
  const membership = {
    note: "The electable set is a fold over records committed BELOW height - MEMBERSHIP_ACTIVATION_DELAY, seeded with genesis' producer. Possession and authorization sign DIFFERENT domain-separated messages over the same claim.",
    activationDelay: MEMBERSHIP_ACTIVATION_DELAY,
    claim: membershipClaim(claimFields),
    possessionMessage: possessionMessage(claimFields),
    authorizationMessage: authorizationMessage(claimFields),
    record: joinRecord,
    foldAtHeights: Object.fromEntries(
      [5, 12, 13, 14, 20].map((h) => [
        String(h),
        membersAt({ founder: alice.address, height: h, recordsAt: foldRecords }),
      ]),
    ),
    foldNote: `the record is included at #5, so bob becomes electable at #${5 + MEMBERSHIP_ACTIVATION_DELAY}`,
  };

  // ── emission ───────────────────────────────────────────────────────────
  const emission = {
    note: "Flat, not halving. The schedule reaches the ceiling exactly.",
    hardCap: PIX_HARD_CAP,
    reward: GENESIS_LIGHT_REWARD,
    horizonPixels: LIGHT_HORIZON,
    rewardAt: Object.fromEntries(
      [0, 1, 209_999, 210_000, LIGHT_HORIZON - 1, LIGHT_HORIZON].map((i) => [
        String(i),
        lightReward(i),
      ]),
    ),
    mintedThrough: Object.fromEntries(
      [0, 1, 47, 210_000, LIGHT_HORIZON].map((n) => [String(n), mintedThrough(n)]),
    ),
    scheduleTotalEqualsCap: mintedThrough(LIGHT_HORIZON) === PIX_HARD_CAP,
  };

  // ── signature eras ─────────────────────────────────────────────────────
  const eras = {
    note: "Signature rules changed once. Exactly one era applies at any height, and a verifier must never fall back between them — a fallback is a downgrade oracle.",
    crownedNetworkId: CROWNED_NETWORK_ID,
    legacyEraEndHeight: LEGACY_SIG_ERA_END_HEIGHT,
    eraAt: Object.fromEntries(
      [
        [CROWNED_NETWORK_ID, 0],
        [CROWNED_NETWORK_ID, LEGACY_SIG_ERA_END_HEIGHT - 1],
        [CROWNED_NETWORK_ID, LEGACY_SIG_ERA_END_HEIGHT],
        [0x504c, 0],
      ].map(([net, h]) => [`${net}@${h}`, sigEraFor({ networkId: net!, height: h! })]),
    ),
  };

  // ── a whole canonical block ────────────────────────────────────────────
  // The end-to-end target: an implementation that reproduces every digest above should
  // be able to accept this pixel, and `verifyChain` on the pair must be true.
  // NOT the crowned network id. On network 20553 every pixel below
  // LEGACY_SIG_ERA_END_HEIGHT must verify under the pre-PIX-16 constructions, and these
  // blocks are freshly signed under the current ones — so `verifyChain` correctly rejected
  // them. A vector chain is not the crowned Earth, and claiming its id would have baked
  // that contradiction into the artifact a second implementation is built against.
  let chain = await createGenesis(alice, PIXEL_LAB_NETWORK_ID, { now: T0 });
  const genesisPixel = chain.pixels[0]!;
  // Built by hand rather than through `proposeTransfer`, so the spend's timestamp is
  // named. `proposeTransfer` reads the clock, which is right for a wallet and wrong for a
  // frozen vector.
  const { signTransaction } = await import("../src/lib/pixel/transaction");
  const genesisUtxo = [...chain.utxos.values()][0]!;
  const spend = await signTransaction(
    await createTransaction({
      timestamp: T0 + 500,
      inputs: [{ txid: genesisUtxo.txid, vout: genesisUtxo.vout }],
      outputs: [
        { amount: 7, address: bob.address },
        { amount: genesisUtxo.amount - 7, address: alice.address },
      ],
      metadata: { description: "vector spend", reference: "VEC-2" },
    }),
    alice,
  );
  chain = await sequenceBlock({ ...chain, pending: [spend] }, alice, { now: T0 + 1000 });
  const sealed = chain.pixels[1]!;

  const tipField = buildFieldWitnesses(
    1,
    [genesisPixel.color].map(
      (c) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
    ),
  );
  const waveField = computeTipWaveField({
    tipIndex: 1,
    sequence: sealed.sequence,
    prevHash: sealed.prevHash,
    merkleRoot: sealed.merkleRoot,
    priorTipHashes: [genesisPixel.hash],
  });
  const picture = await buildSpatialPicture([genesisPixel, sealed]);

  /**
   * `revealedAt` is a display timestamp outside consensus — it is not in
   * `canonicalTxBody`, so it affects no digest and no signature (the coverage harness
   * classifies it `public`). It is normalized here so the vector file is byte-stable;
   * an implementation may emit whatever it likes and still agree on every hash.
   */
  const normalizeDisplayClocks = (pixel: LedgerPixel): LedgerPixel =>
    JSON.parse(
      JSON.stringify(pixel, (key, value) => (key === "revealedAt" ? 0 : value)),
    ) as LedgerPixel;

  const block = {
    networkId: PIXEL_LAB_NETWORK_ID,
    networkNote: `deliberately not ${CROWNED_NETWORK_ID}: on the crowned network every pixel below #${LEGACY_SIG_ERA_END_HEIGHT} must verify under the pre-PIX-16 signature constructions, and these are signed under the current ones`,
    note: "A complete pixel and its parent. An implementation that can accept this, and verify the two-pixel chain, has the acceptance rule right. `revealedAt` is normalized to 0 throughout: it is a display timestamp outside canonicalTxBody, so it affects no digest and no signature.",
    genesis: normalizeDisplayClocks(genesisPixel),
    pixel: normalizeDisplayClocks(sealed),
    recomputed: {
      merkleRoot: await merkleRoot(sealed.transactions.map((t) => t.txid)),
      fieldDigest: computeFieldDigest(tipField),
      waveDigest: waveField.waveDigest,
      spatialRoot: picture.spatialRoot,
      electableAtHeight1: electableAt(chain, 1),
    },
    chainVerifies: await verifyChain(chain),
  };

  return {
    $comment: [
      "Frozen protocol vectors for Pixel Ledger. Language-neutral.",
      "",
      "These pin the BYTES, not just the numbers: every `*Message`, `*Preimage`,",
      "`canonicalTxBody` and `claim` field is the exact string that gets hashed or",
      "signed. An implementation that produces the right digest from a different",
      "preimage will agree today and fork later, on a case nobody tested.",
      "",
      "Regenerate with `bun run vectors:write` ONLY when the protocol legitimately",
      "changes. `bun run test:protocol-vectors` fails the build when the committed file",
      "and the code disagree, in either direction.",
      "",
      "See docs/VECTORS.md.",
    ],
    version: 1,
    generatedBy: "scripts/vectors-generate.ts",
    frozenInputs: { seedA: SEED_A, seedB: SEED_B, baseTimestamp: T0 },
    digests,
    addresses,
    transactionIdentity,
    merkle,
    pols,
    membership,
    emission,
    eras,
    block,
  };
}

if (import.meta.main) {
  const out = join(import.meta.dir, "../fixtures/vectors");
  await mkdir(out, { recursive: true });
  const vectors = await buildVectors();
  const path = join(out, "protocol-v1.json");
  await Bun.write(path, JSON.stringify(vectors, null, 2) + "\n");
  console.log(`wrote ${path}`);
  console.log(`  ${Object.keys(vectors).length} sections`);
}

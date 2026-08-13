#!/usr/bin/env bun
/**
 * The gift-and-record rules, proved to refuse.
 *
 * docs/GIFT-AND-RECORD.md described four rules that nothing enforced, which is the
 * same as not having them. Every rule below is shown twice: a legitimate moment it
 * lets through, and the specific abuse it refuses. A rule that never rejects
 * anything is decoration.
 *
 * Proves:
 *   1. A gift of one PIX to someone new is allowed.
 *   2. A second gift to the same person is refused — supply is bounded by pairs.
 *   3. A gift of more than one PIX is refused — an uncapped pair is a faucet.
 *   4. A batched gift is refused — it would exhaust many pairs in one transaction.
 *   5. A record backed by three distinct givers is allowed.
 *   6. A record from self-funded wallets is refused — quorum, not fee.
 *   7. A record that keeps the picture's share is refused.
 *   8. A record costing other than three PIX is refused.
 *   9. The picture address holds what was spent, and nobody holds a key to it.
 *  10. Unlabelled transfers and mints are untouched, so the policy is opt-in.
 */

import { createGenesis, proposeTransfer, sequenceBlock } from "../src/lib/pixel/chain";
import {
  GiftAndRecordError,
  PICTURE_PHRASE,
  assertMomentAllowed,
  giftAndRecordThesis,
  momentKind,
  pictureAddress,
} from "../src/lib/pixel/gift-and-record";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import type { PixelChainState } from "../src/lib/pixel/chain";
import type { LightKeypair } from "../src/lib/pixel/scheme";
import type { TxOutput } from "../src/lib/pixel/transaction";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

/** Build a signed moment and hand back the tx without committing to the rule check. */
async function moment(
  state: PixelChainState,
  from: LightKeypair,
  outputs: TxOutput[],
  kind?: "gift" | "record",
) {
  return proposeTransfer(state, from, outputs, { description: kind ?? "transfer", kind });
}

/** Assert a moment is refused, and by which rule. */
async function refuses(
  state: PixelChainState,
  from: LightKeypair,
  outputs: TxOutput[],
  kind: "gift" | "record",
  rule: string,
  what: string,
): Promise<void> {
  const { state: proposed, tx } = await moment(state, from, outputs, kind);
  try {
    await assertMomentAllowed(proposed, tx);
  } catch (err) {
    assert(err instanceof GiftAndRecordError, `${what}: wrong error type`);
    const e = err as GiftAndRecordError;
    assert(e.rule === rule, `${what}: expected rule ${rule}, got ${e.rule}`);
    console.log(`▸ refused ${what} (${e.rule}) ✓`);
    return;
  }
  console.error(`✗ ${what} was allowed; the ${rule} rule does not bite`);
  process.exit(1);
}

console.log("═══ GIFT AND RECORD ═══\n");

const witness = await generatePixelKeypair("PIX-ML-DSA-65");
const alice = await generatePixelKeypair("PIX-ML-DSA-65");
const bob = await generatePixelKeypair("PIX-ML-DSA-65");
const carol = await generatePixelKeypair("PIX-ML-DSA-65");
const dave = await generatePixelKeypair("PIX-ML-DSA-65");
const stranger = await generatePixelKeypair("PIX-ML-DSA-65");

let chain = await createGenesis(witness);
const picture = await pictureAddress();

// 9. The picture address is derived from a phrase, not a key.
{
  assert(picture.startsWith("pix1"), "the picture address should look like an address");
  assert(picture === (await pictureAddress()), "the picture address must be stable");
  const { sha512Hex } = await import("../src/lib/pixel/crypto");
  const recomputed = `pix1${(await sha512Hex(`pix-picture|${PICTURE_PHRASE}`)).slice(0, 38)}`;
  assert(picture === recomputed, "anyone must be able to recompute the picture address");
  console.log(`▸ picture address recomputable from its phrase: ${picture.slice(0, 16)}… ✓`);
}

// 10. Mints and unlabelled transfers are not gifts or records.
{
  const genesisTx = chain.pixels[0]!.transactions[0]!;
  assert(momentKind(genesisTx) === "mint", "a transaction with no inputs is a mint");
  await assertMomentAllowed(chain, genesisTx);
  const { state: s, tx } = await moment(chain, witness, [{ address: alice.address, amount: 7 }]);
  assert(momentKind(tx) === "transfer", "an unlabelled transaction is a plain transfer");
  await assertMomentAllowed(s, tx); // must not throw: the policy is opt-in per moment
  console.log("▸ mints and unlabelled transfers pass through untouched ✓");
}

// 1. A first gift is allowed.
async function gift(from: LightKeypair, to: string) {
  const { state: s, tx } = await moment(chain, from, [{ address: to, amount: 1 }], "gift");
  await assertMomentAllowed(s, tx);
  chain = await sequenceBlock(s, witness);
}
await gift(witness, alice.address);
console.log("▸ a first gift of one PIX to someone new is allowed ✓");

// 2. A second gift to the same person is refused.
await refuses(
  chain,
  witness,
  [{ address: alice.address, amount: 1 }],
  "gift",
  "gift/one-per-pair",
  "a second gift to the same person",
);

// 3. An oversized gift is refused.
await refuses(
  chain,
  witness,
  [{ address: bob.address, amount: 5 }],
  "gift",
  "gift/amount",
  "a gift of five PIX",
);

// 4. A batched gift is refused.
await refuses(
  chain,
  witness,
  [
    { address: bob.address, amount: 1 },
    { address: carol.address, amount: 1 },
  ],
  "gift",
  "gift/one-recipient",
  "two gifts batched into one transaction",
);

// Seed the graph: the witness welcomes three people, who each give to Dave.
await gift(witness, bob.address);
await gift(witness, carol.address);
await gift(witness, alice.address === bob.address ? carol.address : stranger.address);
await gift(alice, dave.address);
await gift(bob, dave.address);
await gift(carol, dave.address);

// 5. Dave holds light from three distinct givers, so he can record.
{
  const { state: s, tx } = await moment(
    chain,
    dave,
    [
      { address: picture, amount: 1 },
      { address: stranger.address, amount: 1 },
      { address: witness.address, amount: 1 },
    ],
    "record",
  );
  await assertMomentAllowed(s, tx);
  chain = await sequenceBlock(s, witness);
  console.log("▸ a record backed by three distinct givers is allowed ✓");
}

// 6. Self-funded light does not make a quorum.
{
  // The stranger holds two PIX from two givers: the witness's gift and Dave's record.
  // Top up to three the way an attacker would — a plain transfer, which the gift rule
  // never sees. Enough light to pay for a record, not enough people behind it.
  const { state: s, tx } = await moment(chain, witness, [{ address: stranger.address, amount: 1 }]);
  await assertMomentAllowed(s, tx);
  chain = await sequenceBlock(s, witness);
  const { balanceOf } = await import("../src/lib/pixel/chain");
  assert(
    balanceOf(chain, stranger.address) >= 3,
    `the stranger needs three PIX to attempt a record, has ${balanceOf(chain, stranger.address)}`,
  );

  await refuses(
    chain,
    stranger,
    [
      { address: picture, amount: 1 },
      { address: alice.address, amount: 1 },
      { address: witness.address, amount: 1 },
    ],
    "record",
    "record/quorum",
    "a record from fewer than three distinct givers",
  );
}

// Dave's record spent everything he had. Refund him so the next two refusals are
// about the rules rather than about an empty wallet.
{
  const { state: s, tx } = await moment(chain, witness, [{ address: dave.address, amount: 3 }]);
  await assertMomentAllowed(s, tx);
  chain = await sequenceBlock(s, witness);
}

// 7. Keeping the picture's share is refused.
await refuses(
  chain,
  dave,
  [
    { address: stranger.address, amount: 2 },
    { address: witness.address, amount: 1 },
  ],
  "record",
  "record/picture-share",
  "a record that keeps the picture's share",
);

// 8. A record must cost exactly three.
await refuses(
  chain,
  dave,
  [
    { address: picture, amount: 1 },
    { address: witness.address, amount: 1 },
  ],
  "record",
  "record/cost",
  "a record costing two PIX",
);

// 9 (continued). The picture holds what was spent into it, and cannot spend it.
{
  const { balanceOf } = await import("../src/lib/pixel/chain");
  const inPicture = balanceOf(chain, picture);
  assert(inPicture === 1, `the picture should hold 1 PIX from the one record, got ${inPicture}`);
  console.log(`▸ the picture holds ${inPicture} PIX — spent, not burned, and still countable ✓`);
}

// 11. The rules are wired into block production, not merely available to call.
//
// Everything above proves assertMomentAllowed refuses. That is worth nothing if the
// chain never calls it — the same "described but not enforced" gap one level down.
// So: turn the policy on and check a bad moment cannot reach a block.
{
  process.env.PIXEL_GIFT_AND_RECORD = "1";
  const { giftAndRecordEnabled } = await import("../src/lib/pixel/gift-and-record");
  assert(giftAndRecordEnabled(), "the policy should read as on");

  // A repeat gift to Alice — refused by rule, and the witness already gave to her.
  const { state: s } = await moment(
    chain,
    witness,
    [{ address: alice.address, amount: 1 }],
    "gift",
  );
  const before = chain.pixels.length;
  const sealed = await sequenceBlock(s, witness);
  const sealedTxs = sealed.pixels[sealed.pixels.length - 1]!.transactions;
  const carried = sealedTxs.filter((tx) => momentKind(tx) === "gift");
  assert(sealed.pixels.length === before + 1, "the block should still be produced");
  assert(
    carried.length === 0,
    `a repeat gift reached a block: ${carried.length} gift(s) sealed despite the pair limit`,
  );
  console.log("▸ with the policy on, a repeat gift is dropped from the block it was in ✓");

  // And a legitimate moment still seals, so enforcement is not just refusing everything.
  const fresh = await generatePixelKeypair("PIX-ML-DSA-65");
  const { state: ok } = await moment(
    chain,
    witness,
    [{ address: fresh.address, amount: 1 }],
    "gift",
  );
  const good = await sequenceBlock(ok, witness);
  const kept = good.pixels[good.pixels.length - 1]!.transactions.filter(
    (tx) => momentKind(tx) === "gift",
  );
  assert(kept.length === 1, `a first gift should seal, got ${kept.length}`);
  console.log("▸ with the policy on, a first gift still seals ✓");
  delete process.env.PIXEL_GIFT_AND_RECORD;
}

const t = giftAndRecordThesis();
for (const [k, v] of Object.entries(t)) console.log(`\n${k.padEnd(8)}${v}`);
console.log("\n═══ PASS — every rule refuses something ═══");

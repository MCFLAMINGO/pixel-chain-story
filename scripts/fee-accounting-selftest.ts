#!/usr/bin/env bun
/**
 * A fee is light that changes hands. Issuance is light that begins to exist.
 *
 * The cap check counted the whole coinbase as issuance, and `verifyChain` summed the
 * same figure and compared it against `mintedThrough` — a pure emission schedule that
 * knows nothing about fees. Both were harmless only because no fee has ever been paid
 * on the crowned chain. The first nonzero fee would have made `verifyChain` reject a
 * perfectly valid history, and it would have surfaced as "your chain is invalid" rather
 * than "your accounting is wrong", which is the worst possible way to learn it.
 *
 * `BASE_REVELATION_FEE_UNITS` is not what makes a fee, and never was: `applySpendTx`
 * returns `inputTotal - outputTotal`, so any transaction that spends more than it pays
 * out leaves a fee behind. That means this can be tested on the real production path
 * with no constant to override and no flag to flip — which is the only kind of test
 * worth having for something that would only have broken in production.
 *
 * Everything below fails before the issuance/fees split.
 */

import {
  acceptBlock,
  balanceOf,
  createGenesis,
  sequenceBlock,
  validateAndApplyBlockTxs,
  verifyChain,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import { lightReward, mintedThrough, PIX_HARD_CAP } from "../src/lib/pixel/economics";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import {
  createTransaction,
  finalizeTransaction,
  revealTransaction,
  signTransaction,
  type Transaction,
} from "../src/lib/pixel/transaction";

/** A block only carries revealed light, so a hand-built coinbase must say so. */
function revealAndFinalize(tx: Transaction, sequence: number): Transaction {
  return finalizeTransaction(revealTransaction(tx, sequence));
}

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

console.log("═══ FEE ACCOUNTING — a fee is not a mint ═══\n");

const alice = await generatePixelKeypair("PIX-ML-DSA-65");
const bob = await generatePixelKeypair("PIX-ML-DSA-65");
const genesis = await createGenesis(alice);
const utxo = [...genesis.utxos.values()][0]!;
const FEE = 7;

// A transaction that deliberately leaves a fee: pay out less than it spends. No flag,
// no constant — this is what a fee has always been in this codebase.
const feePayer = await signTransaction(
  await createTransaction({
    inputs: [{ txid: utxo.txid, vout: utxo.vout }],
    outputs: [{ amount: utxo.amount - FEE, address: bob.address }],
    metadata: { description: `pays a ${FEE} PIX fee`, reference: "FEE-1" },
  }),
  alice,
);

const pending: PixelChainState = {
  ...genesis,
  pending: [feePayer],
  reservedInputs: new Set([`${utxo.txid}:${utxo.vout}`]),
};

const sealed = await sequenceBlock(pending, alice);
const block = sealed.pixels[sealed.pixels.length - 1]!;
const coinbase = block.transactions[0]!;
const coinbaseTotal = coinbase.outputs.reduce((s, o) => s + o.amount, 0);
const reward = lightReward(block.index);

check(block.transactions.length === 2, "the fee-paying transaction made it into the pixel");
check(
  coinbaseTotal === reward + FEE,
  `coinbase is reward + fee = ${reward} + ${FEE} = ${coinbaseTotal}`,
);

// The gate must report the two figures separately — this is the whole fix.
const applied = await validateAndApplyBlockTxs({
  utxos: genesis.utxos,
  txs: block.transactions,
  index: block.index,
  sequence: block.sequence,
});
check(applied.fees === FEE, `the gate reports fees = ${applied.fees}`);
check(applied.coinbaseTotal === reward + FEE, `and coinbaseTotal = ${applied.coinbaseTotal}`);
check(
  applied.issuance === reward,
  `and issuance = ${applied.issuance}, the schedule's reward and nothing more`,
);

// The one that used to be broken: replay must accept a chain that collected a fee.
check(await verifyChain(sealed), "verifyChain accepts a chain that collected a fee");

// Independent replay of the arithmetic, not through the chain's own helpers.
let coinbaseSum = 0;
for (const p of sealed.pixels) {
  for (const t of p.transactions) {
    if (t.inputs.length === 0) coinbaseSum += t.outputs.reduce((s, o) => s + o.amount, 0);
  }
}
check(
  coinbaseSum === mintedThrough(sealed.pixels.length) + FEE,
  `coinbases total ${coinbaseSum} = schedule ${mintedThrough(sealed.pixels.length)} + fee ${FEE}` +
    " — so counting coinbases as issuance is exactly the old bug",
);

// Conservation: the fee moved to the sequencer, it did not appear from nowhere.
const total = [...sealed.utxos.values()].reduce((s, u) => s + u.amount, 0);
check(
  total === mintedThrough(sealed.pixels.length),
  `total supply ${total} equals the schedule — the fee circulated, it did not inflate`,
);
check(
  balanceOf(sealed, bob.address) === utxo.amount - FEE,
  `bob received ${utxo.amount - FEE}, the fee having been deducted`,
);
check(
  balanceOf(sealed, alice.address) === reward + FEE,
  `alice (the sequencer) holds reward + fee = ${reward + FEE}`,
);

// A peer replaying the same block must agree, so live and replay do not diverge.
const peer = await acceptBlock(genesis, block);
check(peer.pixels.length === 2, "a peer accepts the fee-paying pixel");
check(await verifyChain(peer), "and its resulting chain verifies");

// The coinbase must still be exactly reward + fees — a producer cannot keep more.
//
// Built with createTransaction rather than by editing the honest coinbase's outputs, so
// its txid genuinely derives from its body. Otherwise T1.3's identity check fires first
// and the test passes for the wrong reason — which is exactly what it did on the first
// run, and is a good argument for asserting on the message rather than merely on "threw".
const greedyCoinbase = revealAndFinalize(
  await createTransaction({
    inputs: [],
    outputs: [{ amount: coinbaseTotal + 1, address: alice.address }],
    metadata: { description: "one more than earned", reference: `LIGHT-${block.index}` },
  }),
  block.sequence,
);
let greedyRefused = "";
try {
  await validateAndApplyBlockTxs({
    utxos: genesis.utxos,
    txs: [greedyCoinbase, ...block.transactions.slice(1)],
    index: block.index,
    sequence: block.sequence,
  });
} catch (err) {
  greedyRefused = (err as Error).message;
}
check(
  /Coinbase must equal light reward \+ fees/.test(greedyRefused),
  `a producer claiming one PIX more than reward + fees is refused: "${greedyRefused.slice(0, 44)}…"`,
);

// …and one less is refused too, so the rule is an equality rather than a ceiling.
const stingyCoinbase = revealAndFinalize(
  await createTransaction({
    inputs: [],
    outputs: [{ amount: reward, address: alice.address }],
    metadata: { description: "forgets the fee", reference: `LIGHT-${block.index}` },
  }),
  block.sequence,
);
let stingyRefused = "";
try {
  await validateAndApplyBlockTxs({
    utxos: genesis.utxos,
    txs: [stingyCoinbase, ...block.transactions.slice(1)],
    index: block.index,
    sequence: block.sequence,
  });
} catch (err) {
  stingyRefused = (err as Error).message;
}
check(
  /Coinbase must equal light reward \+ fees/.test(stingyRefused),
  "a coinbase that leaves the fee unclaimed is also refused — equality, not a ceiling",
);

// And the cap is measured against issuance, so fees can never push past it. Checked
// arithmetically rather than by minting 10.3 billion PIX.
check(
  applied.issuance <= PIX_HARD_CAP - mintedThrough(block.index),
  "the cap is measured against issuance, so a fee can never consume headroom",
);

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log("═══ PASS — fees circulate, the schedule mints ═══");

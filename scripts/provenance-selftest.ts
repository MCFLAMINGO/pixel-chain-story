#!/usr/bin/env bun
/**
 * Where each PIX came from — asked of a real chain, not a model.
 *
 * The rules in docs/GIFT-AND-RECORD.md need this: one gift per ordered pair, three
 * distinct givers for a record, and a ticket checked by looking rather than by
 * trusting a database. All three are questions about history, which means a restart
 * cannot forget them.
 *
 * Proves:
 *   1. Light traces back to whoever authored the transaction that made it.
 *   2. A coinbase reads as minted, not as an anonymous gift.
 *   3. Distinct givers are counted, which is what a record's quorum needs.
 *   4. "Has A ever given to B" survives the gift being spent.
 *   5. The ticket check: holding unspent light from an issuer, and losing it by
 *      spending it, so entry cannot be transferred.
 */

import { createGenesis, proposeTransfer, sequenceBlock, balanceOf } from "../src/lib/pixel/chain";
import {
  giversOf,
  hasGifted,
  holdsLightFrom,
  lightHeldBy,
  provenanceThesis,
} from "../src/lib/pixel/provenance";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

console.log("═══ PROVENANCE ═══\n");

const promoter = await generatePixelKeypair("PIX-ML-DSA-65");
const alice = await generatePixelKeypair("PIX-ML-DSA-65");
const bob = await generatePixelKeypair("PIX-ML-DSA-65");
const carol = await generatePixelKeypair("PIX-ML-DSA-65");

// The promoter holds the genesis wage, so it can seed others.
let chain = await createGenesis(promoter);

// 1 + 2. The sequencer's own light is minted, not given.
{
  const held = await lightHeldBy(chain, promoter.address);
  assert(held.length > 0, "the sequencer should hold its wage");
  assert(
    held.every((h) => h.minted && h.giver === null),
    "a coinbase must read as minted rather than as an anonymous gift",
  );
  console.log(`▸ the sequencer's wage reads as minted, not given (${held.length} output) ✓`);
}

// The promoter gives light to three people — the seeding a concert would need.
async function give(to: string, amount: number) {
  ({ state: chain } = await proposeTransfer(chain, promoter, [{ address: to, amount }], {
    description: "ticket",
  }));
  chain = await sequenceBlock(chain, promoter);
}
await give(alice.address, 1);
await give(bob.address, 1);
await give(carol.address, 1);

// 1. Light traces to its giver.
{
  const held = await lightHeldBy(chain, alice.address);
  assert(held.length === 1, `alice should hold one output, got ${held.length}`);
  assert(held[0]!.giver === promoter.address, "alice's light must trace to the promoter");
  assert(!held[0]!.minted, "given light is not minted light");
  console.log("▸ light traces back to whoever authored the transaction that made it ✓");
}

// 3. Distinct givers — what a record's quorum counts.
{
  assert((await giversOf(chain, alice.address)).size === 1, "alice has one giver");
  // Alice and Bob both give to Carol, so Carol has two distinct givers plus the promoter.
  ({ state: chain } = await proposeTransfer(chain, alice, [{ address: carol.address, amount: 1 }], {
    description: "onward",
  }));
  chain = await sequenceBlock(chain, promoter);
  const givers = await giversOf(chain, carol.address);
  assert(givers.has(promoter.address), "carol's promoter light is still traceable");
  assert(givers.has(alice.address), "carol's light from alice is traceable");
  assert(givers.size === 2, `carol should have two distinct givers, got ${givers.size}`);
  console.log(`▸ distinct givers counted: carol holds light from ${givers.size} people ✓`);
}

// 4. The pair question survives the gift being spent.
{
  assert(await hasGifted(chain, promoter.address, alice.address), "the promoter gave to alice");
  assert(!(await hasGifted(chain, alice.address, promoter.address)), "alice never gave back");
  assert(!(await hasGifted(chain, alice.address, alice.address)), "nobody gifts themselves");

  // Alice already spent her promoter light onward to carol. The act still happened.
  assert(balanceOf(chain, alice.address) === 0, "alice spent what she was given");
  assert(
    await hasGifted(chain, promoter.address, alice.address),
    "a spent gift still counts — the pair limit is about the act, not the remainder",
  );
  console.log("▸ 'has A ever given to B' survives the gift being spent ✓");
}

// 5. The ticket check.
{
  assert(await holdsLightFrom(chain, bob.address, promoter.address), "bob still holds his ticket");
  assert(
    !(await holdsLightFrom(chain, bob.address, alice.address)),
    "bob holds nothing from alice",
  );
  // Alice spent her promoter light, so she can no longer prove admission with it.
  assert(
    !(await holdsLightFrom(chain, alice.address, promoter.address)),
    "spending the ticket loses it — entry cannot be transferred",
  );
  console.log("▸ ticket holds while unspent, and is lost by spending it ✓");
}

const t = provenanceThesis();
console.log(`\nalready:  ${t.already}`);
console.log(`enables:  ${t.enables}`);
console.log(`limit:    ${t.limit}`);
console.log("\n═══ PASS — the chain already knew where the light came from ═══");

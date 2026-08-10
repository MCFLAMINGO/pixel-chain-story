#!/usr/bin/env bun
/**
 * The faucet is bounded, and the bound is read from history.
 *
 * It used to top a balance back up to a threshold, so spend-two-claim-two was an
 * open mint limited only by a vault that grows with every pixel. Counting claims
 * per address cannot fix that — wallets are unlinkable by design and a fresh
 * address is free.
 *
 * Proves:
 *   1. History, not memory, remembers who was funded — so a restart cannot forget.
 *   2. A grant is once per address, and spending does not reopen it.
 *   3. A total budget caps the whole chain, and the last grant is trimmed to fit.
 *   4. The honest limit is stated: new addresses still work, the damage is capped.
 */

import { createGenesis, proposeTransfer, sequenceBlock } from "../src/lib/pixel/chain";
import {
  FAUCET_DEFAULT_BUDGET,
  faucetDecision,
  faucetGrantedTo,
  faucetLedger,
  faucetThesis,
} from "../src/lib/pixel/faucet-ledger";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

console.log("═══ FAUCET BOUND ═══\n");

const vault = await generatePixelKeypair("PIX-ML-DSA-65");
const alice = await generatePixelKeypair("PIX-ML-DSA-65");
const bob = await generatePixelKeypair("PIX-ML-DSA-65");

let state = await createGenesis(vault);

// Nothing granted yet.
assert(faucetLedger(state).granted === 0, "a fresh chain has granted nothing");
assert(!faucetGrantedTo(state, alice.address), "alice has not been funded");
const first = faucetDecision({ state, address: alice.address, amount: 10 });
assert(first.allowed && first.amount === 10, "the first claim is allowed in full");
console.log("▸ a fresh chain has granted nothing; the first claim is allowed ✓");

// Grant it the way the node does, then read it back out of history.
async function grant(to: string, amount: number) {
  const spoken = await proposeTransfer(state, vault, [{ address: to, amount }], {
    description: `faucet ${amount} PIX → pay face`,
    recipientLabel: "faucet",
    reference: `FAUCET-${to.slice(0, 18)}`,
  });
  state = await sequenceBlock(spoken.state, vault);
}

await grant(alice.address, 10);
assert(faucetGrantedTo(state, alice.address), "the grant must be visible in history");
assert(faucetLedger(state).granted === 10, "the ledger must total the grant");
console.log("▸ the grant is read back from the chain, not from node memory ✓");

// 2. Once per address, and spending does not reopen it — the original bug.
const repeat = faucetDecision({ state, address: alice.address, amount: 10 });
assert(!repeat.allowed, "a second claim on the same address must be refused");
assert(!repeat.allowed && /already been funded/.test(repeat.reason), "the refusal must say why");

({ state } = await proposeTransfer(state, alice, [{ address: bob.address, amount: 8 }], {
  description: "spend most of it",
}));
state = await sequenceBlock(state, vault);
const afterSpending = faucetDecision({ state, address: alice.address, amount: 10 });
assert(!afterSpending.allowed, "spending must not reopen the tap — this was the open mint");
console.log("▸ one grant per address; spending does not reopen it ✓");

// 3. A budget caps the whole chain, and the final grant is trimmed to fit.
const small = 25;
const second = await generatePixelKeypair("PIX-ML-DSA-65");
const third = await generatePixelKeypair("PIX-ML-DSA-65");
await grant(second.address, 10);
const trimmed = faucetDecision({ state, address: third.address, amount: 10, budget: small });
assert(
  trimmed.allowed && trimmed.amount === 5,
  `the last grant is trimmed to fit, got ${JSON.stringify(trimmed)}`,
);
await grant(third.address, 5);

const exhausted = faucetDecision({
  state,
  address: (await generatePixelKeypair("PIX-ML-DSA-65")).address,
  amount: 10,
  budget: small,
});
assert(!exhausted.allowed, "past the budget, the faucet is closed");
assert(
  !exhausted.allowed && /whole budget/.test(exhausted.reason),
  "the refusal must name the budget",
);
assert(
  !exhausted.allowed && /send you your first light/.test(exhausted.reason),
  "and should point at the human path, since that is what remains",
);
console.log(`▸ a ${small} PIX budget closes the faucet and trims the last grant ✓`);

// 4. The default is a real ceiling rather than infinity.
assert(FAUCET_DEFAULT_BUDGET > 0 && Number.isFinite(FAUCET_DEFAULT_BUDGET), "budget is finite");
const t = faucetThesis();
console.log(`\nwas:    ${t.was}`);
console.log(`why:    ${t.why}`);
console.log(`now:    ${t.now}`);
console.log(`limit:  ${t.limit}`);
console.log("\n═══ PASS — the tap has a handle ═══");

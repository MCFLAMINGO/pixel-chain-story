#!/usr/bin/env bun
/**
 * Sequencer-set drift between two operators.
 *
 * `registerSequencer` mutates local state from gossip hellos. It is not a
 * transaction, is not carried in a block, and is not signed into consensus. But
 * `acceptBlock` requires a block's bound electable set to equal the validator's
 * own derived set *exactly*.
 *
 * With one operator that never matters. With two it is the first thing to break:
 * a node that has not yet heard a peer's hello rejects that peer's blocks.
 *
 * Worse, the two validation paths disagree with each other. `verifyChain` takes
 * the electable set from the block and only checks that it grows monotonically,
 * so the same block is valid as history and invalid live. A chain whose live
 * validity depends on out-of-band gossip state is not independently verifiable,
 * which is the property the whole project rests on.
 *
 * This test documents the gap. It asserts the drift is real, not that it is
 * acceptable.
 */

import {
  acceptBlock,
  createGenesis,
  proposeTransfer,
  nextSequencerAddress,
  registerSequencer,
  sequenceBlock,
  verifyChain,
} from "../src/lib/pixel/chain";
import { generateLightKeypair } from "../src/lib/pixel/crypto";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

console.log("═══ ELECTABLE DRIFT ═══\n");

const alice = await generateLightKeypair();
const bob = await generateLightKeypair();

// Operator A has heard from both. Operator B has only heard itself — a hello in
// flight, a restart, or simply joining a minute later.
let a = await createGenesis(alice);
a = registerSequencer(a, bob);

let b = structuredClone(a) as typeof a;
b = { ...b, sequencers: b.sequencers.filter((s) => s.address !== bob.address) };
b = registerSequencer(b, bob);
b = { ...b, sequencers: b.sequencers.filter((s) => s.address !== alice.address) };

console.log(`▸ A knows ${a.sequencers.length} sequencer(s), B knows ${b.sequencers.length} ✓`);
assert(a.sequencers.length === 2, "A must know both operators");
assert(b.sequencers.length === 1, "B must know only itself — the drifted view");

// A produces an honest block under its own view.
({ state: a } = await proposeTransfer(a, alice, [{ amount: 1, address: bob.address }], {
  description: "a real moment",
}));
// Whoever the lottery picks produces it; the point is the bound set, not who won.
const turn = nextSequencerAddress(a);
const producer = turn === alice.address ? alice : bob;
a = await sequenceBlock(a, producer);
const block = a.pixels[a.pixels.length - 1]!;
console.log(
  `▸ A sequenced #${block.index} binding ${block.lightProof.electable?.length} electable ✓`,
);

// The chain A holds is valid history by the chain's own rules.
assert(await verifyChain(a), "A's chain must verify as history");
console.log("▸ verifyChain accepts it — history takes the electable set from the block ✓");

// B rejects the very same block, because acceptBlock compares against gossip state.
let rejected = "";
try {
  await acceptBlock(b, block);
} catch (e) {
  rejected = (e as Error).message;
}
assert(rejected !== "", "B must reject a block bound to an electable set it does not share");
assert(
  /[Ee]lectable/.test(rejected),
  `rejection must be about the electable set, got: ${rejected}`,
);
console.log(`▸ B rejects the same block live: "${rejected.slice(0, 72)}…" ✓`);

// The two paths disagree about one block. That is the defect.
console.log(
  "\n▸ DRIFT CONFIRMED — one block, valid as history and invalid live, decided by\n" +
    "  who had heard whose hello. Membership is gossip state; block validity\n" +
    "  depends on it. Two operators is where this starts to bite.",
);

// Convergence is the current mitigation, and it is worth stating that it works
// once the hello lands — the problem is the window, not permanence.
const converged = registerSequencer(b, alice);
const accepted = await acceptBlock(converged, block);
assert(accepted.pixels.length === block.index + 1, "once B hears the hello, the block accepts");
console.log("▸ after B hears A's hello, the same block accepts — the window closes, late ✓");

console.log(
  "\nwhat this means: sequencer membership must be carried by the chain, not by\n" +
    "gossip, before more operators can help. Until then, adding operators adds\n" +
    "disagreement rather than network.",
);
console.log("\n═══ PASS — the drift is real and reproducible ═══");

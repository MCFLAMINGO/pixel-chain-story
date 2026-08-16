#!/usr/bin/env bun
/**
 * Sequencer-set drift between two operators — now impossible by construction.
 *
 * ## What this file used to say
 *
 * It used to demonstrate the defect, deliberately, and it was right to:
 *
 *   > `registerSequencer` mutates local state from gossip hellos. It is not a
 *   > transaction, is not carried in a block, and is not signed into consensus. But
 *   > `acceptBlock` requires a block's bound electable set to equal the validator's
 *   > own derived set *exactly*.
 *   >
 *   > With one operator that never matters. With two it is the first thing to break:
 *   > a node that has not yet heard a peer's hello rejects that peer's blocks.
 *
 * And it closed with the fix, which is the sentence this rewrite implements:
 *
 *   > sequencer membership must be carried by the chain, not by gossip, before more
 *   > operators can help. Until then, adding operators adds disagreement rather than
 *   > network.
 *
 * ## What it says now
 *
 * Membership is a fold over the records committed in pixels (`membership.ts`), seeded
 * with genesis' producer. `state.sequencers` survives only as a public-key lookup for
 * display, and validation never reads it. So the question this file was written to ask
 * — *does whose hello arrived first change whether a block is valid?* — no longer has
 * a way to be answered yes.
 *
 * The tests are therefore inverted rather than deleted. Deleting them would lose the
 * record of what was wrong, and the inverted assertions are the strongest possible
 * statement that it is fixed: the *same scenario*, the *same drifted views*, and now
 * one verdict.
 */

import {
  acceptBlock,
  createGenesis,
  electableAt,
  noteSequencerKey,
  proposeTransfer,
  sequenceBlock,
  verifyChain,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

console.log("═══ ELECTABLE DRIFT — membership is history, so drift cannot happen ═══\n");

const alice = await generatePixelKeypair("PIX-ML-DSA-65");
const bob = await generatePixelKeypair("PIX-ML-DSA-65");

// Operator A has heard from both. Operator B has only heard itself — a hello in
// flight, a restart, or simply joining a minute later. Exactly the original setup.
let a = await createGenesis(alice);
a = noteSequencerKey(a, bob);

let b = structuredClone(a) as PixelChainState;
b = { ...b, utxos: new Map(a.utxos), usedOtsLeaves: new Set(a.usedOtsLeaves) };
b = { ...b, sequencers: b.sequencers.filter((s) => s.address === bob.address) };

console.log(`▸ A's key table lists ${a.sequencers.length}, B's lists ${b.sequencers.length}`);
check(a.sequencers.length === 2, "A notes both operators' keys");
check(b.sequencers.length === 1, "B notes only its own — the drifted view");

// The point: those tables no longer decide anything. Both nodes fold the same
// membership from the same history.
const aElectable = electableAt(a, 1);
const bElectable = electableAt(b, 1);
check(
  aElectable.join("|") === bElectable.join("|"),
  `both nodes fold the SAME electable set despite opposite key tables (${aElectable.length} member)`,
);
check(
  aElectable.length === 1 && aElectable[0] === alice.address,
  "and it is genesis' producer, because no membership record has been committed",
);

// Bob is noted by A but is not electable, because being known is not being a member.
check(
  !aElectable.includes(bob.address),
  "B is in A's key table yet NOT electable — a hello confers no authority",
);

// A produces an honest block. Only the founder can, so there is no lottery to lose.
({ state: a } = await proposeTransfer(a, alice, [{ amount: 1, address: bob.address }], {
  description: "a real moment",
}));
a = await sequenceBlock(a, alice);
const block = a.pixels[a.pixels.length - 1]!;
console.log(
  `▸ A sequenced #${block.index} binding ${block.lightProof.electable?.length} electable address`,
);

check(await verifyChain(a), "A's chain verifies as history");

// The original defect: B rejected this very block. Now it accepts it.
let bRejection = "";
let accepted: PixelChainState | null = null;
try {
  accepted = await acceptBlock(b, block);
} catch (err) {
  bRejection = (err as Error).message;
}
check(
  accepted !== null,
  `B accepts the same block live${bRejection ? ` — but rejected it: ${bRejection}` : ""}`,
);
check(
  accepted?.pixels.length === block.index + 1,
  "…and lands on the same height, with no hello having been exchanged",
);

// The two paths must agree about the one block — that was the actual defect.
check(accepted != null && (await verifyChain(accepted)), "B's resulting chain also verifies");

// A node that knows nobody at all still agrees, which is the strongest form of the
// property: validity depends on history alone.
const knowsNobody: PixelChainState = { ...b, sequencers: [] };
let blindAccepted = false;
try {
  const next = await acceptBlock(knowsNobody, block);
  blindAccepted = next.pixels.length === block.index + 1;
} catch {
  blindAccepted = false;
}
check(blindAccepted, "a node with an EMPTY key table accepts it too");

// And the inverse: a node that has been told about a hundred strangers agrees as well,
// so gossip can neither add nor remove electability.
let noisy: PixelChainState = { ...b };
for (let i = 0; i < 100; i++) {
  const noise = await generatePixelKeypair("PIX-ML-DSA-65");
  noisy = noteSequencerKey(noisy, noise);
}
check(
  electableAt(noisy, 1).length === 1,
  "100 gossiped strangers do not widen the electable set by one",
);
let noisyAccepted = false;
try {
  const next = await acceptBlock(noisy, block);
  noisyAccepted = next.pixels.length === block.index + 1;
} catch {
  noisyAccepted = false;
}
check(noisyAccepted, "and that node accepts the same block");

console.log(
  "\n▸ DRIFT CLOSED — membership is a fold over committed records, so a block's\n" +
    "  validity cannot depend on which hello arrived first. Adding operators now\n" +
    "  adds network rather than disagreement.",
);

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log("═══ PASS — one history, one verdict ═══");

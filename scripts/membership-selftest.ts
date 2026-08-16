#!/usr/bin/env bun
/**
 * Membership is history, so a stranger cannot produce and honest nodes cannot drift.
 *
 * ## What was broken
 *
 * `registerSequencer` mutated a local set from gossip hellos, and `acceptPixels`
 * added a block's *claimed* producer to that set **before** validating the block —
 * "learn producer before accept". `acceptBlock` then compared the block's bound
 * electable set against the set the block had just populated. So:
 *
 *   - an address that was never registered, invited or staked could grind one keypair
 *     until it won the lottery, extend the tip, mint the 50 PIX light reward, and end
 *     up permanently electable, with `verifyChain` returning true afterwards
 *   - and two honest operators rejected each other's blocks depending on whose hello
 *     had arrived, so the same block was valid as history and invalid live
 *
 * Both are the same defect: membership was an input to validation instead of an
 * output of history. `scripts/electable-drift-selftest.ts` demonstrated the second
 * and named the fix in its own closing line.
 *
 * This file is the inverse of that demonstration. Every assertion here failed before
 * `membership.ts` existed.
 */

import {
  acceptBlock,
  balanceOf,
  createGenesis,
  electableAt,
  electableKeysAt,
  founderOf,
  noteSequencerKey,
  sequenceBlock,
  verifyChain,
  type LedgerPixel,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import {
  authorizationMessage,
  MEMBERSHIP_ACTIVATION_DELAY,
  possessionMessage,
  sequencerRecordProblem,
  type SequencerRecord,
} from "../src/lib/pixel/membership";
import { generatePixelKeypair, signPixel } from "../src/lib/pixel/scheme";
import { selectSequencer } from "../src/lib/pixel/pol";
import { canonicalElectable } from "../src/lib/pixel/chain";
import { createTransaction } from "../src/lib/pixel/transaction";
import type { LightKeypair } from "../src/lib/pixel/crypto";

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

/** Open the mempool with an entry the producer will drop, so a pixel can be sealed. */
async function junkPending(to: string) {
  return createTransaction({
    inputs: [{ txid: "00".repeat(64), vout: 0 }],
    outputs: [{ amount: 1, address: to }],
    metadata: { description: "opens the mempool; dropped by the producer" },
  });
}

/** Advance one pixel, produced by whoever the fold elects. */
async function advance(
  state: PixelChainState,
  keys: Map<string, LightKeypair>,
): Promise<PixelChainState> {
  const tip = state.pixels[state.pixels.length - 1]!;
  const electable = electableAt(state, tip.index + 1);
  const chosen = selectSequencer(tip.hash, tip.sequence + 1, electable);
  const producer = keys.get(chosen);
  if (!producer) throw new Error(`no key for elected ${chosen}`);
  const withPending = { ...state, pending: [await junkPending(chosen)] };
  return sequenceBlock(withPending, producer);
}

/** Build a well-formed join record for `joiner`, authorised by `by`. */
async function joinRecord(
  joiner: LightKeypair,
  by: LightKeypair,
  includedAt: number,
): Promise<SequencerRecord> {
  const claim = {
    kind: "sequencer-join" as const,
    address: joiner.address,
    publicKey: joiner.publicKey,
    scheme: (joiner.scheme ?? "PIX-ML-DSA-65") as "PIX-ML-DSA-65",
    includedAt,
    authorizedBy: by.address,
  };
  return {
    ...claim,
    possession: await signPixel(possessionMessage(claim), joiner),
    authorization: await signPixel(authorizationMessage(claim), by),
  };
}

console.log("═══ MEMBERSHIP — history decides who may produce ═══\n");

const founder = await generatePixelKeypair("PIX-ML-DSA-65");
const keys = new Map<string, LightKeypair>([[founder.address, founder]]);
let chain = await createGenesis(founder);

check(founderOf(chain) === founder.address, "genesis' producer is the founding member");
check(
  electableAt(chain, 1).length === 1 && electableAt(chain, 1)[0] === founder.address,
  "the fold at #1 is exactly the founder",
);

// ── 1. a stranger cannot produce, however many keypairs it grinds ──────────
// The original attack: grind a keypair until the lottery would pick it, add itself
// to its own local registry, and produce. It won on the first try.
const tip0 = chain.pixels[chain.pixels.length - 1]!;
let stranger = await generatePixelKeypair("PIX-ML-DSA-65");
let grinds = 1;
for (;;) {
  const wouldWin =
    selectSequencer(
      tip0.hash,
      tip0.sequence + 1,
      canonicalElectable([founder.address, stranger.address]),
    ) === stranger.address;
  if (wouldWin) break;
  stranger = await generatePixelKeypair("PIX-ML-DSA-65");
  grinds++;
  if (grinds > 500) throw new Error("could not grind a winning key");
}
console.log(`  (stranger ground ${grinds} keypair(s) to a key that would have won)`);

// It adds itself locally — exactly what node.ts used to do on its behalf.
const strangerView = noteSequencerKey(chain, stranger);
check(
  electableAt(strangerView, 1).length === 1,
  "self-registering locally does NOT enter the electable set",
);

let produced = "";
try {
  const withPending = { ...strangerView, pending: [await junkPending(stranger.address)] };
  await sequenceBlock(withPending, stranger);
  produced = "PRODUCED";
} catch (err) {
  produced = (err as Error).message;
}
check(
  /Not this node's turn/.test(produced),
  `the stranger cannot produce: "${produced.slice(0, 48)}…"`,
);

// Grinding at scale buys nothing, because the set is not a function of the key.
let anyWinner = false;
for (let i = 0; i < 200; i++) {
  const candidate = await generatePixelKeypair("PIX-ML-DSA-65");
  if (electableAt(noteSequencerKey(chain, candidate), 1).includes(candidate.address)) {
    anyWinner = true;
    break;
  }
}
check(!anyWinner, "200 ground keypairs, none of them electable");

// ── 2. a block that forges its own electable set is refused ───────────────
// Even hand-crafted: take a legitimate block and widen the set it binds.
chain = await advance(chain, keys);
check(chain.pixels.length === 2, "the founder produced #1 normally");

const honest = chain.pixels[chain.pixels.length - 1]!;
const forged: LedgerPixel = {
  ...honest,
  lightProof: {
    ...honest.lightProof,
    electable: canonicalElectable([founder.address, stranger.address]),
  },
};
const parent: PixelChainState = { ...chain, pixels: chain.pixels.slice(0, -1) };
let forgedRejection = "";
try {
  await acceptBlock(parent, forged);
} catch (err) {
  forgedRejection = (err as Error).message;
}
check(
  /Electable set mismatch/.test(forgedRejection),
  `a block binding a widened electable set is refused: "${forgedRejection.slice(0, 56)}…"`,
);

// A stranger cannot even be *blamed* for a block: the proof address must be elected.
const misattributed: LedgerPixel = {
  ...honest,
  lightProof: { ...honest.lightProof, sequencerAddress: stranger.address },
};
let misRejection = "";
try {
  await acceptBlock(parent, misattributed);
} catch (err) {
  misRejection = (err as Error).message;
}
check(misRejection !== "", "a block attributed to a non-member is refused");

// ── 3. joining requires possession AND authorization ─────────────────────
const newcomer = await generatePixelKeypair("PIX-ML-DSA-65");
keys.set(newcomer.address, newcomer);
const activeNow = electableKeysAt(chain, chain.pixels.length);

const good = await joinRecord(newcomer, founder, chain.pixels.length);
check((await sequencerRecordProblem(good, activeNow)) === null, "a properly signed join is valid");

// Self-authorised: the joiner signs its own invitation.
const selfAuthorised = await joinRecord(newcomer, newcomer, chain.pixels.length);
check(
  (await sequencerRecordProblem(selfAuthorised, activeNow)) !== null,
  "a self-authorised join is refused — entry is by invitation",
);

// Authorised by a non-member.
const outsiderAuthorised = await joinRecord(newcomer, stranger, chain.pixels.length);
check(
  (await sequencerRecordProblem(outsiderAuthorised, activeNow)) !== null,
  "a join authorised by a non-member is refused",
);

// Possession forged: claim someone else's address.
const impersonating: SequencerRecord = { ...good, address: stranger.address };
check(
  (await sequencerRecordProblem(impersonating, activeNow)) !== null,
  "a join claiming an address the key does not hold is refused",
);

// Authorization stripped.
const noAuth: SequencerRecord = { ...good, authorization: good.possession };
check(
  (await sequencerRecordProblem(noAuth, activeNow)) !== null,
  "a join whose authorization is really a copy of the possession is refused",
);

// Replayed at a different height: both signatures cover includedAt.
const replayed: SequencerRecord = { ...good, includedAt: good.includedAt + 5 };
check(
  (await sequencerRecordProblem(replayed, activeNow)) !== null,
  "a join lifted to a different height is refused — includedAt is signed",
);

// ── 4. the activation delay means no producer is elected by a set it wrote ─
const includedAt = chain.pixels.length;
const record = await joinRecord(newcomer, founder, includedAt);
const producerAt = electableAt(chain, includedAt);
const withRecord = {
  ...chain,
  pending: [await junkPending(founder.address)],
};
const elected = selectSequencer(
  chain.pixels[chain.pixels.length - 1]!.hash,
  chain.pixels[chain.pixels.length - 1]!.sequence + 1,
  producerAt,
);
chain = await sequenceBlock(withRecord, keys.get(elected)!, { membership: [record] });
check(chain.pixels.length === includedAt + 1, `join record committed in pixel #${includedAt}`);
check(
  chain.pixels[includedAt]!.membership?.length === 1,
  "the pixel carries the membership record",
);
check(
  chain.pixels[includedAt]!.lightProof.membershipDigest != null,
  "and binds a membership digest into its light proof",
);
check(
  !electableAt(chain, includedAt + 1).includes(newcomer.address),
  "the newcomer is NOT electable in the very next pixel",
);
check(
  !electableAt(chain, includedAt + MEMBERSHIP_ACTIVATION_DELAY - 1).includes(newcomer.address),
  `still not electable one pixel before activation (+${MEMBERSHIP_ACTIVATION_DELAY})`,
);
check(
  electableAt(chain, includedAt + MEMBERSHIP_ACTIVATION_DELAY).includes(newcomer.address),
  `electable exactly at +${MEMBERSHIP_ACTIVATION_DELAY}`,
);
check(await verifyChain(chain), "the chain with a membership record verifies");

// ── 5. drift is unrepresentable: different gossip, same verdict ───────────
// The exact scenario electable-drift-selftest was written to expose. Two nodes with
// deliberately different `sequencers` maps must agree, because neither consults it.
chain = await advance(chain, keys);
const shared = chain.pixels[chain.pixels.length - 1]!;
const beforeShared: PixelChainState = { ...chain, pixels: chain.pixels.slice(0, -1) };

const nodeKnowsEveryone = noteSequencerKey(noteSequencerKey(beforeShared, newcomer), stranger);
const nodeKnowsNobody: PixelChainState = { ...beforeShared, sequencers: [] };

let bothAccepted = 0;
for (const [label, view] of [
  ["knows everyone", nodeKnowsEveryone],
  ["knows nobody", nodeKnowsNobody],
] as const) {
  try {
    const next = await acceptBlock(view, shared);
    if (next.pixels.length === shared.index + 1) bothAccepted++;
  } catch (err) {
    console.error(`    ${label} rejected: ${(err as Error).message}`);
  }
}
check(bothAccepted === 2, "two nodes with opposite gossip histories accept the same block");

// ── 6. the founder can never be evicted ─────────────────────────────────
const evictFounder: SequencerRecord = {
  ...(await joinRecord(founder, founder, chain.pixels.length)),
  kind: "sequencer-leave",
};
const foldWithEviction = electableAt(
  {
    ...chain,
    pixels: [
      ...chain.pixels,
      { ...chain.pixels[chain.pixels.length - 1]!, membership: [evictFounder] } as LedgerPixel,
    ],
  },
  chain.pixels.length + MEMBERSHIP_ACTIVATION_DELAY + 1,
);
check(
  foldWithEviction.includes(founder.address),
  "a leave record cannot evict the founder — the set can never be emptied",
);

// ── 7. nobody minted anything they should not have ──────────────────────
check(balanceOf(chain, stranger.address) === 0, "the stranger holds 0 PIX");
check(await verifyChain(chain), "the final chain verifies");
const mintedToStranger = chain.pixels.some((p) =>
  p.transactions.some(
    (t) => t.inputs.length === 0 && t.outputs.some((o) => o.address === stranger.address),
  ),
);
check(!mintedToStranger, "no coinbase ever paid the stranger");

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log("═══ PASS — membership is a fold over history, not a gossip race ═══");

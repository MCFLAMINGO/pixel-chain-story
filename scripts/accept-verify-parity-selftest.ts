#!/usr/bin/env bun
/**
 * `acceptBlock` and `verifyChain` must agree about every block, always.
 *
 * ## Why this is a property and not a list of cases
 *
 * The audit found one instance: `verifyChain` required every transaction to be revealed
 * or final and `acceptBlock` did not, so a block could be accepted live and then fail
 * as history. Fixing that instance would have been easy and worthless, because the
 * instance was not the bug. The bug was that two independent implementations of one
 * rule set existed and nobody was checking they said the same thing.
 *
 * The same defect produced three other findings in this audit — four different ways of
 * resolving the electable set, a `lightProof.prevHash` check present in the light client
 * and absent in the full node, and a `sequence` bound in neither. Each looked like a
 * missing `if`. Each was really the same missing test.
 *
 * So this asserts the relationship rather than any of its instances:
 *
 *   for every candidate block B against state S —
 *     acceptBlock(S, B) succeeds  ⟺  verifyChain(resulting chain) is true
 *
 * Both directions matter. Left-to-right catches accept being too permissive, which is
 * how a node ends up on a history it cannot re-verify after a restart. Right-to-left
 * catches accept being too strict, which is how a node rejects a block the rest of the
 * network has already agreed on — a partition caused by one's own validator.
 *
 * Candidates are honest blocks and mutated ones, over random histories, so the property
 * is tested where the two paths are most likely to drift: the edges.
 */

import fc from "fast-check";
import {
  acceptBlock,
  createGenesis,
  proposeTransfer,
  sequenceBlock,
  verifyChain,
  type LedgerPixel,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import { createTransaction } from "../src/lib/pixel/transaction";
import type { LightKeypair } from "../src/lib/pixel/crypto";

let failures = 0;
let checks = 0;
function fail(msg: string): void {
  console.error(`✗ ${msg}`);
  failures++;
}

/** Every way we know how to make a block wrong, plus leaving it alone. */
type Mutation = { name: string; apply: (b: LedgerPixel) => LedgerPixel };

const MUTATIONS: Mutation[] = [
  { name: "honest (unmutated)", apply: (b) => b },
  { name: "index off by one", apply: (b) => ({ ...b, index: b.index + 1 }) },
  { name: "sequence off by one", apply: (b) => ({ ...b, sequence: b.sequence + 1 }) },
  {
    name: "proof sequence disagrees",
    apply: (b) => ({ ...b, lightProof: { ...b.lightProof, sequence: b.sequence + 3 } }),
  },
  {
    name: "proof prevHash disagrees",
    apply: (b) => ({ ...b, lightProof: { ...b.lightProof, prevHash: "ab".repeat(64) } }),
  },
  { name: "prevHash broken", apply: (b) => ({ ...b, prevHash: "cd".repeat(64) }) },
  { name: "merkle root broken", apply: (b) => ({ ...b, merkleRoot: "ef".repeat(64) }) },
  { name: "hash broken", apply: (b) => ({ ...b, hash: "12".repeat(64) }) },
  { name: "not illuminated", apply: (b) => ({ ...b, illuminated: false }) },
  {
    name: "colour altered",
    apply: (b) => ({ ...b, color: { ...b.color, r: (b.color.r + 40) % 256 } }),
  },
  { name: "proximity altered", apply: (b) => ({ ...b, proximity: [...b.proximity, 999] }) },
  { name: "field emptied", apply: (b) => ({ ...b, field: [] }) },
  {
    name: "wave amplitude altered",
    apply: (b) => ({ ...b, wave: (b.wave ?? []).map((h) => ({ ...h, amplitudeMilli: 1 })) }),
  },
  {
    name: "field digest altered",
    apply: (b) => ({ ...b, lightProof: { ...b.lightProof, fieldDigest: "aa".repeat(64) } }),
  },
  {
    name: "spatial root altered",
    apply: (b) => ({ ...b, lightProof: { ...b.lightProof, spatialRoot: "bb".repeat(64) } }),
  },
  {
    name: "electable widened",
    apply: (b) => ({
      ...b,
      lightProof: {
        ...b.lightProof,
        electable: [...(b.lightProof.electable ?? []), "pix1" + "f".repeat(38)].sort(),
      },
    }),
  },
  {
    name: "scheme removed",
    apply: (b) => {
      const proof = { ...b.lightProof } as Record<string, unknown>;
      delete proof.scheme;
      return { ...b, lightProof: proof as LedgerPixel["lightProof"] };
    },
  },
  {
    name: "timestamp before parent",
    apply: (b) => ({ ...b, timestamp: 1 }),
  },
  {
    name: "transaction relabelled",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t, i) => (i === 0 ? { ...t, txid: "9a".repeat(64) } : t)),
    }),
  },
  {
    name: "transaction unrevealed",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t) => ({ ...t, state: "superposition" as const })),
    }),
  },
  {
    name: "transaction lightSequence lies",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t) => ({
        ...t,
        lightSequence: (t.lightSequence ?? 0) + 5,
      })),
    }),
  },
  {
    name: "privacy flipped",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t) => ({ ...t, privacy: "private" as const })),
    }),
  },
  {
    name: "coinbase inflated",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t, i) =>
        i === 0 ? { ...t, outputs: t.outputs.map((o) => ({ ...o, amount: o.amount + 1000 })) } : t,
      ),
    }),
  },
  { name: "transactions emptied", apply: (b) => ({ ...b, transactions: [] }) },
  {
    name: "coinbase duplicated",
    apply: (b) => ({ ...b, transactions: [b.transactions[0]!, ...b.transactions] }),
  },
];

/**
 * Check the biconditional for one candidate against one parent state.
 *
 * `verifyChain` is run on the chain that *would* result, which is the only comparison
 * that means anything: the question is not whether both functions dislike a block, but
 * whether a chain one of them produced is a chain the other would stand behind.
 */
async function assertParity(
  parent: PixelChainState,
  candidate: LedgerPixel,
  label: string,
): Promise<void> {
  checks++;
  let accepted: PixelChainState | null = null;
  let acceptError = "";
  try {
    accepted = await acceptBlock(parent, candidate);
  } catch (err) {
    acceptError = err instanceof Error ? err.message : String(err);
  }

  // The chain that would exist if accept were the only gate. Built by hand so the
  // right-to-left direction is testable even when accept refused.
  const wouldBe: PixelChainState = accepted ?? {
    ...parent,
    pixels: [...parent.pixels, candidate],
  };
  const verified = await verifyChain(wouldBe);

  if (accepted && !verified) {
    fail(
      `${label}: acceptBlock ACCEPTED a block whose chain verifyChain REJECTS — ` +
        `a node would be stranded on history it cannot re-verify after a restart`,
    );
    return;
  }
  if (!accepted && verified) {
    fail(
      `${label}: acceptBlock REJECTED (${acceptError.slice(0, 60)}) a block whose chain ` +
        `verifyChain accepts — this node would partition itself from the network`,
    );
  }
}

type Action = { kind: "transfer"; from: number; to: number; amount: number } | { kind: "seal" };

/** Random history, then the parity property at each tip along the way. */
async function runHistory(actions: Action[], wallets: LightKeypair[]): Promise<void> {
  const founder = wallets[0]!;
  let state = await createGenesis(founder);

  for (const action of actions) {
    if (action.kind === "transfer") {
      const from = wallets[action.from % wallets.length]!;
      const to = wallets[action.to % wallets.length]!;
      try {
        ({ state } = await proposeTransfer(
          state,
          from,
          [{ amount: action.amount, address: to.address }],
          {
            description: `parity ${action.amount}`,
          },
        ));
      } catch {
        /* insufficient balance is a fine outcome for a random action */
      }
      continue;
    }

    // Seal. Only the founder is electable, which is correct on a chain with no
    // membership records — see membership.ts.
    if (state.pending.length === 0) {
      state = {
        ...state,
        pending: [
          await createTransaction({
            inputs: [{ txid: "00".repeat(64), vout: 0 }],
            outputs: [{ amount: 1, address: founder.address }],
            metadata: { description: "opens the mempool" },
          }),
        ],
      };
    }

    // Snapshot the parent before sealing, so candidates are tested against the exact
    // state a peer would hold.
    const parent: PixelChainState = {
      ...state,
      utxos: new Map(state.utxos),
      usedOtsLeaves: new Set(state.usedOtsLeaves),
      pending: [],
      reservedInputs: new Set(),
    };

    let sealed: PixelChainState;
    try {
      sealed = await sequenceBlock(state, founder);
    } catch {
      continue;
    }
    const block = sealed.pixels[sealed.pixels.length - 1]!;

    for (const mutation of MUTATIONS) {
      await assertParity(parent, mutation.apply(block), mutation.name);
    }
    state = sealed;
  }
}

console.log("═══ ACCEPT / VERIFY PARITY (property) ═══\n");

const wallets: LightKeypair[] = [];
for (let i = 0; i < 3; i++) wallets.push(await generatePixelKeypair("PIX-ML-DSA-65"));

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant("transfer" as const),
      from: fc.integer({ min: 0, max: 2 }),
      to: fc.integer({ min: 0, max: 2 }),
      amount: fc.integer({ min: 1, max: 40 }),
    }),
  },
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("seal" as const) }) },
);

const runs = Number(process.env.PIXEL_PARITY_RUNS ?? 6);
await fc.assert(
  fc.asyncProperty(fc.array(actionArb, { minLength: 2, maxLength: 5 }), async (actions) => {
    await runHistory(actions, wallets);
    if (failures > 0) throw new Error("parity violated");
  }),
  { numRuns: runs },
);

console.log(`▸ ${MUTATIONS.length} mutations x ${runs} random histories`);
console.log(`▸ ${checks} candidate blocks checked for the biconditional`);
console.log("▸ accept ⇒ verify: no node can be stranded on unverifiable history ✓");
console.log("▸ verify ⇒ accept: no node partitions itself from a valid chain ✓");

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} parity violation(s) ═══`);
  process.exit(1);
}
console.log("═══ PASS — one rule set, two entry points ═══");

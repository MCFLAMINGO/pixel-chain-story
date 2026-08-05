#!/usr/bin/env bun
/**
 * Ledger invariant layer — property tests over randomly generated histories.
 *
 * The Gate I audit's central point was that the ornamental invariants (color,
 * field digest, wave, spatial root) were validated with more rigor than the
 * monetary ones. These four properties are the monetary ones, asserted after
 * every step of a random action sequence:
 *
 *   1. issuance      — total supply === mintedThrough(pixel count)
 *   2. single spend  — no UTXO key is consumed twice across the whole history
 *   3. provenance    — every live UTXO traces back to a coinbase output
 *   4. conservation  — sum of balances === issuance
 *
 * PIX-01, PIX-02 and PIX-03 each violate at least one of these, so this file
 * would have caught all three before they shipped.
 */

import fc from "fast-check";
import {
  acceptBlock,
  balanceOf,
  createGenesis,
  proposeTransfer,
  registerSequencer,
  sequenceBlock,
  verifyChain,
  type LedgerPixel,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import { mintedThrough } from "../src/lib/pixel/economics";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import type { LightKeypair } from "../src/lib/pixel/crypto";

type Action =
  | { kind: "transfer"; from: number; to: number; amount: number }
  | { kind: "seal" }
  | { kind: "overspend"; from: number; to: number }
  | { kind: "phantom"; to: number };

function utxoKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

/** Property 1 + 4: issuance matches the schedule and equals the live supply. */
function assertIssuance(state: PixelChainState, wallets: LightKeypair[]): void {
  const expected = mintedThrough(state.pixels.length);

  let coinbaseTotal = 0;
  for (const pixel of state.pixels) {
    for (const tx of pixel.transactions) {
      if (tx.inputs.length === 0) {
        coinbaseTotal += tx.outputs.reduce((s, o) => s + o.amount, 0);
      }
    }
  }
  if (coinbaseTotal !== expected) {
    throw new Error(`issuance: coinbases total ${coinbaseTotal}, schedule says ${expected}`);
  }

  let live = 0;
  for (const utxo of state.utxos.values()) live += utxo.amount;
  if (live !== expected) {
    throw new Error(`conservation: live supply ${live} !== issuance ${expected}`);
  }

  // Balances are a view over the same set; reserved inputs are still supply.
  const reserved = new Set<string>();
  for (const tx of state.pending) {
    for (const i of tx.inputs) reserved.add(utxoKey(i.txid, i.vout));
  }
  let reservedValue = 0;
  for (const [key, utxo] of state.utxos) {
    if (reserved.has(key)) reservedValue += utxo.amount;
  }
  const spendable = wallets.reduce((s, w) => s + balanceOf(state, w.address), 0);
  if (spendable + reservedValue !== expected) {
    throw new Error(
      `conservation: spendable ${spendable} + reserved ${reservedValue} !== issuance ${expected}`,
    );
  }
}

/** Property 2 + 3: every input is consumed once and every output traces to a coinbase. */
function assertSpendGraph(state: PixelChainState): void {
  const consumed = new Set<string>();
  const created = new Map<string, { amount: number; coinbase: boolean }>();

  for (const pixel of state.pixels) {
    for (const tx of pixel.transactions) {
      let fromCoinbase = tx.inputs.length === 0;
      for (const input of tx.inputs) {
        const key = utxoKey(input.txid, input.vout);
        if (consumed.has(key)) {
          throw new Error(`single spend: ${key} consumed twice`);
        }
        const origin = created.get(key);
        if (!origin) {
          throw new Error(`provenance: ${key} was spent but never created`);
        }
        consumed.add(key);
        if (origin.coinbase) fromCoinbase = true;
      }
      tx.outputs.forEach((out, vout) => {
        created.set(utxoKey(tx.txid, vout), {
          amount: out.amount,
          coinbase: fromCoinbase,
        });
      });
    }
  }

  for (const [key] of state.utxos) {
    const origin = created.get(key);
    if (!origin) throw new Error(`provenance: live UTXO ${key} has no creating transaction`);
    if (!origin.coinbase) {
      throw new Error(`provenance: live UTXO ${key} does not trace back to a coinbase`);
    }
  }
}

async function runHistory(actions: Action[], wallets: LightKeypair[]): Promise<void> {
  const sequencer = wallets[0]!;
  let state = await createGenesis(sequencer);
  for (const w of wallets.slice(1)) state = registerSequencer(state, w);

  assertIssuance(state, wallets);
  assertSpendGraph(state);

  for (const action of actions) {
    try {
      if (action.kind === "transfer") {
        const from = wallets[action.from % wallets.length]!;
        const to = wallets[action.to % wallets.length]!;
        if (balanceOf(state, from.address) < action.amount) continue;
        ({ state } = await proposeTransfer(
          state,
          from,
          [{ amount: action.amount, address: to.address }],
          { description: "invariant probe", reference: "PROP" },
        ));
      } else if (action.kind === "seal") {
        if (state.pending.length === 0) continue;
        // Whoever the lottery elects for this height.
        const { nextSequencerAddress } = await import("../src/lib/pixel/chain");
        const elected = nextSequencerAddress(state, 0);
        const producer = wallets.find((w) => w.address === elected);
        if (!producer) continue;
        state = await sequenceBlock(state, producer);
      } else if (action.kind === "overspend") {
        // Must be refused: outputs exceed inputs.
        const from = wallets[action.from % wallets.length]!;
        const to = wallets[action.to % wallets.length]!;
        const bal = balanceOf(state, from.address);
        await proposeTransfer(state, from, [{ amount: bal + 1_000, address: to.address }], {
          description: "overspend probe",
        }).then(
          () => {
            throw new Error("overspend: proposeTransfer accepted more than the balance");
          },
          () => undefined,
        );
      } else {
        // Phantom coinbase injected straight into a peer's accept path.
        const tip = state.pixels[state.pixels.length - 1]!;
        const forged = { ...tip, index: tip.index + 1 } as LedgerPixel;
        await acceptBlock(state, forged).then(
          () => {
            throw new Error("phantom: acceptBlock took a duplicated pixel");
          },
          () => undefined,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Rejections are expected; invariant violations are not.
      if (/^(issuance|conservation|single spend|provenance|overspend|phantom):/.test(msg)) {
        throw err;
      }
    }

    assertIssuance(state, wallets);
    assertSpendGraph(state);
  }

  if (!(await verifyChain(state))) {
    throw new Error("verifyChain rejected a history built from valid operations");
  }
}

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant("transfer" as const),
      from: fc.integer({ min: 0, max: 3 }),
      to: fc.integer({ min: 0, max: 3 }),
      amount: fc.integer({ min: 1, max: 60 }),
    }),
  },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("seal" as const) }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("overspend" as const),
      from: fc.integer({ min: 0, max: 3 }),
      to: fc.integer({ min: 0, max: 3 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("phantom" as const),
      to: fc.integer({ min: 0, max: 3 }),
    }),
  },
);

async function main(): Promise<void> {
  console.log("═══ LEDGER INVARIANTS (property tests) ═══\n");

  // ML-DSA keys: multi-use, so histories are not bounded by an OTS window.
  const wallets: LightKeypair[] = [];
  for (let i = 0; i < 4; i++) wallets.push(await generatePixelKeypair("PIX-ML-DSA-65"));

  const runs = Number(process.env.PIXEL_PROPERTY_RUNS ?? 25);
  await fc.assert(
    fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 10 }), async (actions) => {
      await runHistory(actions, wallets);
    }),
    { numRuns: runs, verbose: true },
  );
  console.log(`▸ issuance === mintedThrough(tip) ✓`);
  console.log(`▸ no UTXO consumed twice ✓`);
  console.log(`▸ every live UTXO traces to a coinbase ✓`);
  console.log(`▸ balances + reserved === issuance ✓`);
  console.log(`▸ ${runs} random histories held every property\n`);

  console.log("═══ PASS — monetary invariants hold under random histories ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

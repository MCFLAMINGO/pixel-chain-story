#!/usr/bin/env bun
/**
 * Adversarial regression suite — Gate I external audit (consensus surface).
 *
 * Each scenario performs a real attack from docs/audit/EXTERNAL-AUDIT-GATE-I.json.
 * A scenario PASSES when the ledger REJECTS the attack, and FAILS when the
 * attack completes (`exploited(...)`). These assertions are inverted on purpose:
 * green CI must mean "invalid operations fail", not "valid operations succeed".
 *
 * Covers PIX-01, PIX-02, PIX-03, PIX-04, PIX-05, PIX-14, PIX-15.
 */

import {
  acceptBlock,
  balanceOf,
  createGenesis,
  electableAt,
  noteSequencerKey,
  replaceTipIfBetter,
  sequenceBlock,
  verifyChain,
  type LedgerPixel,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import {
  createTransaction,
  finalizeTransaction,
  revealTransaction,
  signTransaction,
  type Transaction,
} from "../src/lib/pixel/transaction";
import { generateLightKeypair, sha512Hex, type LightKeypair } from "../src/lib/pixel/crypto";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import { createLightProof, merkleRoot, selectSequencerWithSkip } from "../src/lib/pixel/pol";
import { composePixelColor, revealProximity } from "../src/lib/pixel/light-color";
import {
  buildFieldWitnesses,
  computeFieldDigest,
  priorFieldColors,
} from "../src/lib/pixel/field-witness";
import { computeTipWaveField } from "../src/lib/pixel/wave";
import { buildSpatialPicture } from "../src/lib/pixel/spatial-picture";
import { opticalBeacon } from "../src/lib/pixel/optical";
import { runSuite, exploited, scenario } from "./ext-audit-harness";

/** Attacker-side block builder — mirrors sequenceBlock with no honesty checks. */
async function forgeBlock(params: {
  state: PixelChainState;
  sequencer: LightKeypair;
  transactions: Transaction[];
  electable?: string[];
  skipCount?: number;
  timestamp?: number;
}): Promise<LedgerPixel> {
  const { state, sequencer } = params;
  const tip = state.pixels[state.pixels.length - 1]!;
  const index = tip.index + 1;
  const sequence = tip.sequence + 1;
  const skipCount = params.skipCount ?? 0;
  const timestamp = params.timestamp ?? Date.now();
  const transactions = params.transactions.map((t) =>
    finalizeTransaction(revealTransaction(t, sequence)),
  );

  const root = await merkleRoot(transactions.map((t) => t.txid));
  const field = buildFieldWitnesses(index, priorFieldColors(state.pixels));
  const fieldDigest = computeFieldDigest(field);
  const waveField = computeTipWaveField({
    tipIndex: index,
    sequence,
    prevHash: tip.hash,
    merkleRoot: root,
    priorTipHashes: state.pixels.map((p) => p.hash),
  });
  const beacon = await opticalBeacon(sequence, tip.hash);
  const hash = await sha512Hex(
    `block|${index}|${tip.hash}|${root}|${sequence}|${timestamp}|${beacon}`,
  );
  const proximity = revealProximity(index, 2);
  const { color } = await composePixelColor({
    index,
    hash,
    prevHash: tip.hash,
    merkleRoot: root,
    beacon,
    sequence,
    timestamp,
    transactions,
    illuminated: true,
    litNeighbors: proximity,
  });
  const picture = await buildSpatialPicture([...state.pixels, { index, illuminated: true, color }]);
  const lightProof = await createLightProof({
    sequence,
    prevHash: tip.hash,
    sequencer,
    skipCount,
    electable: params.electable ?? state.sequencers.map((s) => s.address),
    fieldDigest,
    waveDigest: waveField.waveDigest,
    spatialRoot: picture.spatialRoot,
  });

  return {
    index,
    prevHash: tip.hash,
    merkleRoot: root,
    sequence,
    lightProof,
    transactions,
    timestamp,
    hash,
    color,
    illuminated: true,
    proximity,
    field,
    wave: waveField.hits,
  };
}

async function coinbaseOf(amount: number, address: string, ref: string): Promise<Transaction> {
  return createTransaction({
    inputs: [],
    outputs: [{ amount, address }],
    metadata: { description: `forged mint ${ref}`, reference: ref },
  });
}

// ── PIX-01 ────────────────────────────────────────────────────────────────────
scenario("PIX-01", "spend another party's UTXO with a fresh key", async () => {
  const victim = await generateLightKeypair();
  const attacker = await generateLightKeypair();
  const state = await createGenesis(victim);
  const utxo = [...state.utxos.values()][0]!;

  let theft = await createTransaction({
    inputs: [{ txid: utxo.txid, vout: utxo.vout }],
    outputs: [{ amount: utxo.amount, address: attacker.address }],
    metadata: { description: "PIX-01 theft", reference: "THEFT" },
  });
  // Attacker signs with their OWN key — never owned the coin.
  theft = await signTransaction(theft, attacker);

  const forged = await forgeBlock({
    state,
    sequencer: victim,
    transactions: [await coinbaseOf(50, victim.address, "LIGHT-1"), theft],
  });
  const next = await acceptBlock(state, forged);
  exploited(
    `attacker holds ${balanceOf(next, attacker.address)} PIX; victim ${balanceOf(next, victim.address)}`,
  );
});

// ── PIX-01c ───────────────────────────────────────────────────────────────────
scenario("PIX-01c", "honest producer includes a thief's transaction from the mempool", async () => {
  const victim = await generateLightKeypair();
  const attacker = await generateLightKeypair();
  const state = await createGenesis(victim);
  const utxo = [...state.utxos.values()][0]!;

  let theft = await createTransaction({
    inputs: [{ txid: utxo.txid, vout: utxo.vout }],
    outputs: [{ amount: utxo.amount, address: attacker.address }],
    metadata: { description: "PIX-01c theft", reference: "THEFT-MEMPOOL" },
  });
  theft = await signTransaction(theft, attacker);

  const withTheft: PixelChainState = { ...state, pending: [theft], pendingSince: Date.now() };
  const mined = await sequenceBlock(withTheft, victim);
  if (balanceOf(mined, attacker.address) > 0) {
    exploited(
      `producer included the theft; attacker holds ${balanceOf(mined, attacker.address)} PIX`,
    );
  }
  if (mined.pixels[mined.pixels.length - 1]!.transactions.some((t) => t.txid === theft.txid)) {
    exploited("theft transaction landed in the produced block");
  }
  throw new Error("producer dropped the unauthorized transaction");
});

// ── PIX-02 ────────────────────────────────────────────────────────────────────
scenario("PIX-02", "two coinbases of 1e9 PIX accepted (unbounded inflation)", async () => {
  const seq = await generateLightKeypair();
  const attacker = await generateLightKeypair();
  const state = await createGenesis(seq);

  const forged = await forgeBlock({
    state,
    sequencer: seq,
    transactions: [
      await coinbaseOf(1_000_000_000, attacker.address, "MINT-A"),
      await coinbaseOf(1_000_000_000, attacker.address, "MINT-B"),
    ],
  });
  const next = await acceptBlock(state, forged);
  exploited(`minted ${balanceOf(next, attacker.address)} PIX from two coinbases`);
});

// ── PIX-03 ────────────────────────────────────────────────────────────────────
scenario("PIX-03", "phantom input mints value (no existence check)", async () => {
  const seq = await generateLightKeypair();
  const attacker = await generateLightKeypair();
  const state = await createGenesis(seq);

  let phantom = await createTransaction({
    inputs: [{ txid: "de".repeat(64), vout: 0 }],
    outputs: [{ amount: 500_000, address: attacker.address }],
    metadata: { description: "PIX-03 phantom", reference: "PHANTOM" },
  });
  phantom = await signTransaction(phantom, attacker);

  const forged = await forgeBlock({
    state,
    sequencer: seq,
    transactions: [await coinbaseOf(50, seq.address, "LIGHT-1"), phantom],
  });
  const next = await acceptBlock(state, forged);
  exploited(`phantom input produced ${balanceOf(next, attacker.address)} PIX`);
});

// ── PIX-03b ───────────────────────────────────────────────────────────────────
scenario("PIX-03b", "outputs exceed inputs (value not conserved)", async () => {
  const seq = await generateLightKeypair();
  const attacker = await generateLightKeypair();
  let state = await createGenesis(seq);
  state = registerSequencer(state, attacker);
  const utxo = [...state.utxos.values()][0]!;

  let inflate = await createTransaction({
    inputs: [{ txid: utxo.txid, vout: utxo.vout }],
    outputs: [{ amount: utxo.amount * 1000, address: seq.address }],
    metadata: { description: "PIX-03b inflate", reference: "INFLATE" },
  });
  inflate = await signTransaction(inflate, seq);

  const forged = await forgeBlock({
    state,
    sequencer: seq,
    transactions: [await coinbaseOf(50, seq.address, "LIGHT-1"), inflate],
    electable: state.sequencers.map((s) => s.address),
  });
  const next = await acceptBlock(state, forged);
  exploited(`outputs exceeded inputs; balance now ${balanceOf(next, seq.address)}`);
});

// ── PIX-03c ───────────────────────────────────────────────────────────────────
scenario("PIX-03c", "same UTXO spent twice inside one block", async () => {
  const seq = await generateLightKeypair();
  const attacker = await generateLightKeypair();
  const state = await createGenesis(seq);
  const utxo = [...state.utxos.values()][0]!;

  const mk = async (ref: string) => {
    const tx = await createTransaction({
      inputs: [{ txid: utxo.txid, vout: utxo.vout }],
      outputs: [{ amount: utxo.amount, address: attacker.address }],
      metadata: { description: "PIX-03c double spend", reference: ref },
    });
    return signTransaction(tx, seq);
  };

  const forged = await forgeBlock({
    state,
    sequencer: seq,
    transactions: [
      await coinbaseOf(50, seq.address, "LIGHT-1"),
      await mk("DS-1"),
      await mk("DS-2"),
    ],
  });
  const next = await acceptBlock(state, forged);
  exploited(`double spend accepted; attacker holds ${balanceOf(next, attacker.address)} PIX`);
});

// ── PIX-04 ────────────────────────────────────────────────────────────────────
scenario("PIX-04", "PoLS lottery bypass via self-declared electable set", async () => {
  const genesisSeq = await generateLightKeypair();
  let state = await createGenesis(genesisSeq);

  // Note several keys locally, the way gossip hellos used to. Since T1.1 this confers
  // nothing — membership is a fold over records committed in pixels — so the baseline
  // for "who may produce" has to come from `electableAt`, not from this table. The
  // earlier version of this scenario derived `rightful` from the key table and then
  // picked an "attacker" that turned out to be the founder itself, so it measured a
  // legitimate block and called it an exploit.
  const others: LightKeypair[] = [];
  for (let i = 0; i < 7; i++) {
    const kp = await generateLightKeypair();
    others.push(kp);
    state = noteSequencerKey(state, kp);
  }
  const tip = state.pixels[state.pixels.length - 1]!;
  const electable = electableAt(state, tip.index + 1);
  const rightful = selectSequencerWithSkip(tip.hash, tip.sequence + 1, electable, 0);

  // A genuine non-member: noted locally, never admitted by a membership record.
  const attacker = others.find((k) => k.address !== rightful)!;
  const forged = await forgeBlock({
    state,
    sequencer: attacker,
    transactions: [await coinbaseOf(50, attacker.address, "LIGHT-1")],
    electable: [attacker.address], // one-element lottery they always win
  });
  await acceptBlock(state, forged);
  exploited(
    `non-member ${attacker.address.slice(0, 12)}… produced height 1 (rightful ${rightful.slice(0, 12)}…)`,
  );
});

// ── T1.1 ──────────────────────────────────────────────────────────────────────
scenario("T1.1", "stranger grinds a keypair and extends the tip", async () => {
  // The takeover. node.ts used to register a block's *claimed* producer before
  // validating it, so the electable set was whatever the block said. Grinding one
  // keypair until it won the lottery was enough to extend the tip, mint the light
  // reward, and become permanently electable — with verifyChain returning true.
  const founder = await generateLightKeypair();
  const state = await createGenesis(founder);
  const tip = state.pixels[state.pixels.length - 1]!;

  let stranger = await generateLightKeypair();
  for (let i = 0; i < 400; i++) {
    const set = [founder.address, stranger.address].sort();
    if (selectSequencerWithSkip(tip.hash, tip.sequence + 1, set, 0) === stranger.address) break;
    stranger = await generateLightKeypair();
  }

  // Bind exactly what the poisoned registry would have derived: founder + self.
  const forged = await forgeBlock({
    state,
    sequencer: stranger,
    transactions: [await coinbaseOf(50, stranger.address, "LIGHT-1")],
    electable: [founder.address, stranger.address].sort(),
  });
  // Simulate the deleted "learn producer before accept" line as faithfully as
  // possible: even with the stranger's key noted locally, the block must be refused.
  const poisonedView = noteSequencerKey(state, stranger);
  await acceptBlock(poisonedView, forged);
  exploited(
    `stranger ${stranger.address.slice(0, 12)}… extended the tip and minted the light reward`,
  );
});

// ── PIX-05 ────────────────────────────────────────────────────────────────────
scenario("PIX-05", "verifyChain validates a history containing a stolen coin", async () => {
  const victim = await generateLightKeypair();
  const attacker = await generateLightKeypair();
  const state = await createGenesis(victim);
  const utxo = [...state.utxos.values()][0]!;

  let theft = await createTransaction({
    inputs: [{ txid: utxo.txid, vout: utxo.vout }],
    outputs: [{ amount: utxo.amount, address: attacker.address }],
    metadata: { description: "PIX-05 theft", reference: "THEFT" },
  });
  theft = await signTransaction(theft, attacker);

  const forged = await forgeBlock({
    state,
    sequencer: victim,
    transactions: [await coinbaseOf(50, victim.address, "LIGHT-1"), theft],
  });
  // Bypass acceptBlock entirely — a synced peer's history.
  const poisoned: PixelChainState = {
    ...state,
    pixels: [...state.pixels, forged],
    utxos: (() => {
      const m = new Map(state.utxos);
      m.delete(`${utxo.txid}:${utxo.vout}`);
      forged.transactions.forEach((t) =>
        t.outputs.forEach((o, vout) =>
          m.set(`${t.txid}:${vout}`, {
            txid: t.txid,
            vout,
            amount: o.amount,
            address: o.address,
          }),
        ),
      );
      return m;
    })(),
  };
  if (await verifyChain(poisoned)) {
    exploited("verifyChain returned true for a chain containing an unauthorized spend");
  }
  throw new Error("verifyChain rejected poisoned history");
});

// ── PIX-14 ────────────────────────────────────────────────────────────────────
scenario("PIX-14", "block timestamp far in the future / before parent", async () => {
  const seq = await generateLightKeypair();
  const state = await createGenesis(seq);
  const parent = state.pixels[state.pixels.length - 1]!;

  const forged = await forgeBlock({
    state,
    sequencer: seq,
    transactions: [await coinbaseOf(50, seq.address, "LIGHT-1")],
    timestamp: parent.timestamp - 60_000, // before its own parent
  });
  await acceptBlock(state, forged);
  exploited("block with timestamp before parent accepted");
});

// ── PIX-15 ────────────────────────────────────────────────────────────────────
scenario("PIX-15", "reorg rollback un-burns a consumed OTS leaf", async () => {
  // ML-DSA sequencer so forging candidates cannot exhaust an OTS window;
  // the spender is OTS so a one-time leaf is actually burned.
  const seqA = await generatePixelKeypair("PIX-ML-DSA-65");
  const spender = await generateLightKeypair();
  let state = await createGenesis(seqA);

  // Fund the spender so it can sign with an OTS leaf.
  let fund = await createTransaction({
    inputs: [...state.utxos.values()].slice(0, 1).map((u) => ({ txid: u.txid, vout: u.vout })),
    outputs: [
      { amount: 10, address: spender.address },
      { amount: 40, address: seqA.address },
    ],
    metadata: { description: "fund spender", reference: "FUND" },
  });
  fund = await signTransaction(fund, seqA);
  state = await sequenceBlock({ ...state, pending: [fund], pendingSince: Date.now() }, seqA);

  const spenderUtxo = [...state.utxos.values()].find((u) => u.address === spender.address)!;
  let spend = await createTransaction({
    inputs: [{ txid: spenderUtxo.txid, vout: spenderUtxo.vout }],
    outputs: [{ amount: spenderUtxo.amount, address: seqA.address }],
    metadata: { description: "OTS spend", reference: "SPEND" },
  });
  spend = await signTransaction(spend, spender); // burns spender leaf 0
  const burned = [...state.usedOtsLeaves];
  state = await sequenceBlock({ ...state, pending: [spend], pendingSince: Date.now() }, seqA);
  const afterSpend = new Set(state.usedOtsLeaves);
  const spendLeafKeys = [...afterSpend].filter((k) => !burned.includes(k));

  if (spendLeafKeys.length === 0) throw new Error("no OTS leaf burned (inconclusive)");

  // Competing pixel at the same height with a preferable (lower) hash.
  const tipNow = state.pixels[state.pixels.length - 1]!;
  const rolled: PixelChainState = { ...state, pixels: state.pixels.slice(0, -1) };
  let candidate: LedgerPixel | null = null;
  for (let i = 1; i <= 200 && !candidate; i++) {
    const c = await forgeBlock({
      state: rolled,
      sequencer: seqA,
      transactions: [await coinbaseOf(50, seqA.address, "LIGHT-ALT")],
      timestamp: tipNow.timestamp + i,
    });
    if (c.hash < tipNow.hash) candidate = c;
  }
  if (!candidate) throw new Error("could not build preferable candidate (inconclusive)");

  const replaced = await replaceTipIfBetter(state, candidate);
  if (!replaced) throw new Error("reorg refused (inconclusive)");
  const stillBurned = spendLeafKeys.every((k) => replaced.usedOtsLeaves.has(k));
  if (!stillBurned) {
    exploited(`reorg released OTS leaves ${spendLeafKeys.map((k) => k.slice(-4)).join(",")}`);
  }
  throw new Error("used-leaf set stayed monotonic across reorg");
});

// ── PIX-01b (ML-DSA variant) ──────────────────────────────────────────────────
scenario("PIX-01b", "ML-DSA key spends a UTXO it does not own", async () => {
  const victim = await generatePixelKeypair("PIX-ML-DSA-65");
  const attacker = await generatePixelKeypair("PIX-ML-DSA-65");
  const state = await createGenesis(victim);
  const utxo = [...state.utxos.values()][0]!;

  let theft = await createTransaction({
    inputs: [{ txid: utxo.txid, vout: utxo.vout }],
    outputs: [{ amount: utxo.amount, address: attacker.address }],
    metadata: { description: "PIX-01b theft", reference: "THEFT-MLDSA" },
  });
  theft = await signTransaction(theft, attacker);

  const forged = await forgeBlock({
    state,
    sequencer: victim,
    transactions: [await coinbaseOf(50, victim.address, "LIGHT-1"), theft],
  });
  const next = await acceptBlock(state, forged);
  exploited(`ML-DSA theft accepted; attacker holds ${balanceOf(next, attacker.address)} PIX`);
});

await runSuite("ext-audit-poc (consensus)");

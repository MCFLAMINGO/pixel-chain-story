/**
 * Pixel Chain — Bitcoin-like UTXO ledger with Proof of Light Sequence.
 * Looking at all transactions paints a picture of pixels; each block is one pixel.
 */

import { sha512Hex, type Hex, type LightKeypair } from "./crypto";
import {
  createLightProof,
  merkleRoot,
  selectSequencer,
  verifyLightProof,
  type LightProof,
} from "./pol";
import {
  createTransaction,
  finalizeTransaction,
  revealTransaction,
  signTransaction,
  verifyTransactionSignatures,
  type ReadableMeta,
  type Transaction,
  type TxOutput,
  type Utxo,
} from "./transaction";

export interface PixelColor {
  r: number;
  g: number;
  b: number;
}

export interface PixelBlock {
  index: number;
  prevHash: Hex;
  merkleRoot: Hex;
  sequence: number;
  lightProof: LightProof;
  transactions: Transaction[];
  timestamp: number;
  hash: Hex;
  color: PixelColor;
}

export interface PixelChainState {
  blocks: PixelBlock[];
  utxos: Map<string, Utxo>;
  pending: Transaction[];
  sequencers: LightKeypair[];
}

function utxoKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

async function blockColor(index: number, hash: Hex, merkle: Hex): Promise<PixelColor> {
  const mix = await sha512Hex(`pixel|${index}|${hash}|${merkle}`);
  return {
    r: parseInt(mix.slice(0, 2), 16),
    g: parseInt(mix.slice(2, 4), 16),
    b: parseInt(mix.slice(4, 6), 16),
  };
}

async function hashBlock(header: {
  index: number;
  prevHash: Hex;
  merkleRoot: Hex;
  sequence: number;
  timestamp: number;
  beacon: Hex;
}): Promise<Hex> {
  return sha512Hex(
    `block|${header.index}|${header.prevHash}|${header.merkleRoot}|${header.sequence}|${header.timestamp}|${header.beacon}`,
  );
}

export async function createGenesis(sequencer: LightKeypair): Promise<PixelChainState> {
  const mint = await createTransaction({
    inputs: [],
    outputs: [
      { amount: 1_000_000, address: sequencer.address },
      { amount: 1_000_000, address: sequencer.address },
    ],
    metadata: {
      description: "Genesis light — the first revelation",
      reference: "GENESIS",
    },
  });
  const revealed = finalizeTransaction(revealTransaction(mint, 0));
  const prevHash = "0".repeat(128);
  const proof = await createLightProof({
    sequence: 0,
    prevHash,
    sequencer,
  });
  const root = await merkleRoot([revealed.txid]);
  const timestamp = Date.now();
  const hash = await hashBlock({
    index: 0,
    prevHash,
    merkleRoot: root,
    sequence: 0,
    timestamp,
    beacon: proof.beacon,
  });
  const color = await blockColor(0, hash, root);
  const genesis: PixelBlock = {
    index: 0,
    prevHash,
    merkleRoot: root,
    sequence: 0,
    lightProof: proof,
    transactions: [revealed],
    timestamp,
    hash,
    color,
  };

  const utxos = new Map<string, Utxo>();
  revealed.outputs.forEach((out, vout) => {
    utxos.set(utxoKey(revealed.txid, vout), {
      txid: revealed.txid,
      vout,
      amount: out.amount,
      address: out.address,
    });
  });

  return {
    blocks: [genesis],
    utxos,
    pending: [],
    sequencers: [sequencer],
  };
}

export function registerSequencer(
  state: PixelChainState,
  sequencer: LightKeypair,
): PixelChainState {
  if (state.sequencers.some((s) => s.address === sequencer.address)) return state;
  return { ...state, sequencers: [...state.sequencers, sequencer] };
}

export function balanceOf(state: PixelChainState, address: string): number {
  let sum = 0;
  for (const utxo of state.utxos.values()) {
    if (utxo.address === address) sum += utxo.amount;
  }
  return sum;
}

export function utxosFor(state: PixelChainState, address: string): Utxo[] {
  return [...state.utxos.values()].filter((u) => u.address === address);
}

export async function proposeTransfer(
  state: PixelChainState,
  from: LightKeypair,
  outputs: TxOutput[],
  metadata: ReadableMeta,
): Promise<{ state: PixelChainState; tx: Transaction }> {
  const needed = outputs.reduce((s, o) => s + o.amount, 0);
  const available = utxosFor(state, from.address);
  const selected: Utxo[] = [];
  let total = 0;
  for (const u of available) {
    selected.push(u);
    total += u.amount;
    if (total >= needed) break;
  }
  if (total < needed) {
    throw new Error(`Insufficient balance: need ${needed}, have ${balanceOf(state, from.address)}`);
  }

  const change = total - needed;
  const allOutputs = [...outputs];
  if (change > 0) {
    allOutputs.push({ amount: change, address: from.address });
  }

  let tx = await createTransaction({
    inputs: selected.map((u) => ({ txid: u.txid, vout: u.vout })),
    outputs: allOutputs,
    metadata,
  });
  tx = await signTransaction(tx, from);

  // Spend locally from mempool view so double-spends fail early.
  const nextUtxos = new Map(state.utxos);
  for (const u of selected) {
    nextUtxos.delete(utxoKey(u.txid, u.vout));
  }

  return {
    state: {
      ...state,
      utxos: nextUtxos,
      pending: [...state.pending, tx],
    },
    tx,
  };
}

/** Shine light: sequencer reveals pending txs and appends a block. */
export async function sequenceBlock(state: PixelChainState): Promise<PixelChainState> {
  if (state.pending.length === 0) {
    throw new Error("Nothing in superposition to reveal");
  }

  const tip = state.blocks[state.blocks.length - 1];
  const sequence = tip.sequence + 1;
  const addresses = state.sequencers.map((s) => s.address);
  const chosen = selectSequencer(tip.hash, sequence, addresses);
  const sequencer = state.sequencers.find((s) => s.address === chosen);
  if (!sequencer) throw new Error("Selected sequencer missing");

  const revealed = state.pending.map((tx) => finalizeTransaction(revealTransaction(tx, sequence)));

  for (const tx of revealed) {
    const ok = await verifyTransactionSignatures(tx);
    if (!ok) throw new Error(`Invalid signature on ${tx.txid}`);
  }

  const proof = await createLightProof({
    sequence,
    prevHash: tip.hash,
    sequencer,
  });
  const proofOk = await verifyLightProof(proof, chosen);
  if (!proofOk) throw new Error("Invalid light proof");

  const root = await merkleRoot(revealed.map((t) => t.txid));
  const timestamp = Date.now();
  const hash = await hashBlock({
    index: tip.index + 1,
    prevHash: tip.hash,
    merkleRoot: root,
    sequence,
    timestamp,
    beacon: proof.beacon,
  });
  const color = await blockColor(tip.index + 1, hash, root);

  const block: PixelBlock = {
    index: tip.index + 1,
    prevHash: tip.hash,
    merkleRoot: root,
    sequence,
    lightProof: proof,
    transactions: revealed,
    timestamp,
    hash,
    color,
  };

  const utxos = new Map(state.utxos);
  for (const tx of revealed) {
    for (const input of tx.inputs) {
      utxos.delete(utxoKey(input.txid, input.vout));
    }
    tx.outputs.forEach((out, vout) => {
      utxos.set(utxoKey(tx.txid, vout), {
        txid: tx.txid,
        vout,
        amount: out.amount,
        address: out.address,
      });
    });
  }

  return {
    ...state,
    blocks: [...state.blocks, block],
    utxos,
    pending: [],
  };
}

export async function verifyChain(state: PixelChainState): Promise<boolean> {
  if (state.blocks.length === 0) return false;
  const addresses = state.sequencers.map((s) => s.address);

  for (let i = 0; i < state.blocks.length; i++) {
    const block = state.blocks[i];
    if (i > 0 && block.prevHash !== state.blocks[i - 1].hash) return false;

    const expectedSequencer = selectSequencer(
      i === 0 ? "0".repeat(128) : state.blocks[i - 1].hash,
      block.sequence,
      addresses,
    );
    if (!(await verifyLightProof(block.lightProof, expectedSequencer))) return false;

    const root = await merkleRoot(block.transactions.map((t) => t.txid));
    if (root !== block.merkleRoot) return false;

    const hash = await hashBlock({
      index: block.index,
      prevHash: block.prevHash,
      merkleRoot: block.merkleRoot,
      sequence: block.sequence,
      timestamp: block.timestamp,
      beacon: block.lightProof.beacon,
    });
    if (hash !== block.hash) return false;

    const color = await blockColor(block.index, block.hash, block.merkleRoot);
    if (color.r !== block.color.r || color.g !== block.color.g || color.b !== block.color.b) {
      return false;
    }

    for (const tx of block.transactions) {
      if (tx.state !== "final" && tx.state !== "revealed") return false;
      if (!(await verifyTransactionSignatures(tx))) return false;
    }
  }
  return true;
}

/** Serialize for UI — Maps don't travel through React state cleanly. */
export interface PixelChainView {
  blocks: PixelBlock[];
  utxos: Utxo[];
  pending: Transaction[];
  sequencers: { address: string; publicKey: Hex; label?: string }[];
}

export function toView(state: PixelChainState): PixelChainView {
  return {
    blocks: state.blocks,
    utxos: [...state.utxos.values()],
    pending: state.pending,
    sequencers: state.sequencers.map((s) => ({
      address: s.address,
      publicKey: s.publicKey,
    })),
  };
}

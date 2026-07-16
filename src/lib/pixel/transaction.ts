/**
 * Real UTXO transactions with human-readable metadata.
 * Lifecycle: superposition (commitment only) → light reveal → final.
 */

import {
  generateLightKeypair,
  sha512Hex,
  signLightFull,
  verifyLightFull,
  type Hex,
  type LightKeypair,
} from "./crypto";

export type TxState = "superposition" | "revealed" | "final";

export interface TxOutput {
  amount: number;
  address: string;
}

export interface ReadableMeta {
  description: string;
  reference?: string;
  recipientLabel?: string;
}

export interface TxInput {
  txid: string;
  vout: number;
  signature?: string;
  publicKey?: Hex;
}

export interface Transaction {
  txid: string;
  inputs: TxInput[];
  outputs: TxOutput[];
  metadata: ReadableMeta;
  /** Hash commitment while in superposition — both pending until light. */
  commitment: Hex;
  state: TxState;
  timestamp: number;
  lightSequence?: number;
  revealedAt?: number;
}

export interface Utxo {
  txid: string;
  vout: number;
  amount: number;
  address: string;
}

export function canonicalTxBody(
  tx: Omit<Transaction, "txid" | "state" | "commitment" | "lightSequence" | "revealedAt"> & {
    commitment?: Hex;
  },
): string {
  return JSON.stringify({
    inputs: tx.inputs.map(({ txid, vout }) => ({ txid, vout })),
    outputs: tx.outputs,
    metadata: tx.metadata,
    timestamp: tx.timestamp,
  });
}

export async function createTransaction(params: {
  inputs: TxInput[];
  outputs: TxOutput[];
  metadata: ReadableMeta;
}): Promise<Transaction> {
  const timestamp = Date.now();
  const body = canonicalTxBody({
    inputs: params.inputs,
    outputs: params.outputs,
    metadata: params.metadata,
    timestamp,
  });
  const commitment = await sha512Hex(`superposition|${body}`);
  const txid = await sha512Hex(`txid|${commitment}|${body}`);
  return {
    txid,
    inputs: params.inputs,
    outputs: params.outputs,
    metadata: params.metadata,
    commitment,
    state: "superposition",
    timestamp,
  };
}

export async function signTransaction(
  tx: Transaction,
  keypair: LightKeypair,
): Promise<Transaction> {
  const message = `${tx.commitment}|${canonicalTxBody(tx)}`;
  const signature = await signLightFull(message, keypair);
  return {
    ...tx,
    inputs: tx.inputs.map((input) => ({
      ...input,
      signature,
      publicKey: keypair.publicKey,
    })),
  };
}

export async function verifyTransactionSignatures(tx: Transaction): Promise<boolean> {
  if (tx.inputs.length === 0) return true; // coinbase / genesis mint
  const message = `${tx.commitment}|${canonicalTxBody(tx)}`;
  for (const input of tx.inputs) {
    if (!input.signature || !input.publicKey) return false;
    const ok = await verifyLightFull(message, input.signature, input.publicKey);
    if (!ok) return false;
  }
  return true;
}

/** Collapse superposition — light has observed the transaction. */
export function revealTransaction(tx: Transaction, sequence: number): Transaction {
  if (tx.state === "final") return tx;
  return {
    ...tx,
    state: "revealed",
    lightSequence: sequence,
    revealedAt: Date.now(),
  };
}

export function finalizeTransaction(tx: Transaction): Transaction {
  return { ...tx, state: "final" };
}

export function humanSummary(tx: Transaction, senderAddress?: string): string {
  // Exclude change outputs returning to the sender.
  const external = senderAddress
    ? tx.outputs.filter((o) => o.address !== senderAddress)
    : tx.outputs.length > 1
      ? tx.outputs.slice(0, -1)
      : tx.outputs;
  const total = external.reduce((s, o) => s + o.amount, 0);
  const primary = external[0] ?? tx.outputs[0];
  const to = tx.metadata.recipientLabel ?? primary?.address.slice(0, 12) ?? "unknown";
  const phase =
    tx.state === "superposition"
      ? "In superposition (both pending until light reveals it)"
      : tx.state === "revealed"
        ? "Light has revealed this transfer"
        : "Final on Pixel";
  return `${phase}. Send ${total} PIX to ${to} — ${tx.metadata.description}`;
}

export async function createDemoWallet(label: string): Promise<LightKeypair & { label: string }> {
  const keypair = await generateLightKeypair();
  return { ...keypair, label };
}

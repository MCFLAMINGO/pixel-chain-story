/**
 * Real UTXO transactions with human-readable metadata.
 * Lifecycle: superposition (commitment only) → light reveal → final.
 */

import { type Hex, type LightKeypair } from "./crypto";
import { lightDigest } from "./light-digest";
import {
  addressForScheme,
  generatePixelKeypair,
  schemeFromSignature,
  signPixel,
  verifyPixel,
  type SchemeId,
} from "./scheme";

export type TxState = "superposition" | "revealed" | "final";
export type PrivacyLevel = "public" | "private" | "selective";

export interface TxOutput {
  amount: number;
  address: string;
}

export interface ReadableMeta {
  description: string;
  reference?: string;
  recipientLabel?: string;
  /**
   * Which act this is, under the gift-and-record rules (src/lib/pixel/gift-and-record.ts).
   *
   * Declaring a kind is what invites the stricter check, so it is the author's claim
   * rather than an inference. Absent means an ordinary transfer, which claims neither
   * a gift's freedom nor a record's place in the picture.
   */
  kind?: "gift" | "record";
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
  /** Privacy veil — private hides amounts from public views until selective reveal. */
  privacy: PrivacyLevel;
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
  tx: Omit<
    Transaction,
    "txid" | "state" | "commitment" | "lightSequence" | "revealedAt" | "privacy"
  > & {
    commitment?: Hex;
    privacy?: Transaction["privacy"];
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
  // One door: lightDigest — Lumen never sees these domain strings.
  const commitment = await lightDigest("superposition", body);
  const txid = await lightDigest("txid", commitment, body);
  return {
    txid,
    inputs: params.inputs,
    outputs: params.outputs,
    metadata: params.metadata,
    commitment,
    state: "superposition",
    privacy: "public",
    timestamp,
  };
}

export async function signTransaction(
  tx: Transaction,
  keypair: LightKeypair,
): Promise<Transaction> {
  const message = `${tx.commitment}|${canonicalTxBody(tx)}`;
  const signature = await signPixel(message, keypair);
  return {
    ...tx,
    inputs: tx.inputs.map((input) => ({
      ...input,
      signature,
      publicKey: keypair.publicKey,
    })),
  };
}

/**
 * Shape-only check: each input's signature is valid for the public key carried
 * on that same input.
 *
 * NOT AN AUTHORIZATION CHECK — it never proves the key owns the coin. Consensus
 * must call `verifyTransactionSignaturesForOwners`; PIX-01 was exactly this
 * function reaching `acceptBlock`. A CI guard (`test:audit-scope`) fails the
 * build if this symbol appears in `chain.ts`.
 */
export async function verifySignatureShapeOnly(tx: Transaction): Promise<boolean> {
  if (tx.inputs.length === 0) return true; // coinbase / genesis mint
  const message = `${tx.commitment}|${canonicalTxBody(tx)}`;
  for (const input of tx.inputs) {
    if (!input.signature || !input.publicKey) return false;
    const ok = await verifyPixel(message, input.signature, input.publicKey);
    if (!ok) return false;
  }
  return true;
}

/**
 * Consensus verifier: signatures valid AND each input's public key commits to
 * the address that owns the UTXO being spent.
 */
export async function verifyTransactionSignaturesForOwners(
  tx: Transaction,
  ownerByUtxo: (txid: string, vout: number) => string | undefined,
): Promise<boolean> {
  if (!(await verifySignatureShapeOnly(tx))) return false;
  if (tx.inputs.length === 0) return true;
  for (const input of tx.inputs) {
    if (!input.publicKey || !input.signature) return false;
    const alg = schemeFromSignature(input.signature);
    if (!alg) return false;
    const scheme: SchemeId = alg;
    const owner = ownerByUtxo(input.txid, input.vout);
    if (!owner) return false;
    if ((await addressForScheme(input.publicKey, scheme)) !== owner) return false;
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

export function humanSummary(
  tx: Transaction,
  senderAddress?: string,
  viewer: "party" | "public" = "party",
): string {
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
  const amountLabel = tx.privacy !== "public" && viewer === "public" ? "✱✱✱" : String(total);
  const memo =
    tx.privacy === "private" && viewer === "public" ? "[veiled]" : tx.metadata.description;
  return `${phase}. Send ${amountLabel} PIX to ${to} — ${memo}`;
}

export async function createDemoWallet(label: string): Promise<LightKeypair & { label: string }> {
  const keypair = await generatePixelKeypair();
  return { ...keypair, label };
}

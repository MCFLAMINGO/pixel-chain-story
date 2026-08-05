/**
 * Lit cells — who lit what, and what it meant.
 *
 * A pixel records position, moment and meaning, but nothing in `LedgerPixel`
 * says *whose* moment it was. The coinbase names the sequencer, so the only
 * name on a pixel today belongs to the machine that ordered it. Bitcoin's
 * genesis message works because it is attributable to an act; a pixel's
 * `ReadableMeta` is currently a message with no author field.
 *
 * This module derives that field. Every pixel resolves to a set of lit cells:
 *
 *   - one `light_reward` cell, owned by the sequencer — the wage for ordering
 *   - one `moment` cell per spending transaction, owned by its author
 *
 * That distinction makes "who was paid" and "whose moment this was" separately
 * visible without introducing a second asset. No new token, no consensus change.
 *
 * DERIVED, NOT YET COMMITTED. `litCellsRoot` is a commitment any two parties can
 * recompute from the same pixel, but it is not bound into the signed PoLS payload,
 * so it is not consensus-enforced. Binding it would be a consensus change and is
 * deliberately not done here.
 */

import { sha512Hex, type Hex } from "./crypto";
import { addressForScheme, schemeFromSignature } from "./scheme";
import type { ReadableMeta, Transaction } from "./transaction";
import type { LedgerPixel } from "./chain";

export type LitCellKind = "light_reward" | "moment";

export interface LitCell {
  /** Which pixel. */
  pixelIndex: number;
  /** Position within the pixel — the transaction's index in the block. */
  cellIndex: number;
  /** Whose cell this is. */
  owner: string;
  kind: LitCellKind;
  /** The human-readable content this cell carries. */
  meaning: ReadableMeta;
  txid: string;
  /** Value moved or minted, in ledger units. */
  amount: number;
}

/**
 * Author of a spending transaction.
 *
 * `signTransaction` puts the same key on every input, so a transaction has one
 * author. Returns null for a coinbase, which has no author — only a payee.
 */
export async function authorOf(tx: Transaction): Promise<string | null> {
  const input = tx.inputs[0];
  if (!input?.publicKey || !input.signature) return null;
  const scheme = schemeFromSignature(input.signature);
  if (!scheme) return null;
  return addressForScheme(input.publicKey, scheme);
}

function totalOut(tx: Transaction): number {
  return tx.outputs.reduce((sum, out) => sum + out.amount, 0);
}

/** Derive every lit cell in a pixel, in block order. */
export async function litCellsOf(pixel: LedgerPixel): Promise<LitCell[]> {
  const cells: LitCell[] = [];
  for (let cellIndex = 0; cellIndex < pixel.transactions.length; cellIndex++) {
    const tx = pixel.transactions[cellIndex]!;
    const author = await authorOf(tx);
    const isReward = tx.inputs.length === 0;
    cells.push({
      pixelIndex: pixel.index,
      cellIndex,
      // A coinbase is the sequencer's wage; everything else is someone's moment.
      owner: isReward ? pixel.lightProof.sequencerAddress : (author ?? ""),
      kind: isReward ? "light_reward" : "moment",
      meaning: tx.metadata,
      txid: tx.txid,
      amount: totalOut(tx),
    });
  }
  return cells;
}

/** The cells in a pixel that are somebody's moment rather than a wage. */
export async function momentsOf(pixel: LedgerPixel): Promise<LitCell[]> {
  return (await litCellsOf(pixel)).filter((c) => c.kind === "moment");
}

/** Who owns one cell, or null when the position is unlit. */
export async function ownerOfCell(pixel: LedgerPixel, cellIndex: number): Promise<string | null> {
  const cells = await litCellsOf(pixel);
  return cells[cellIndex]?.owner ?? null;
}

/** Every distinct person with a moment in this pixel. */
export async function authorsOf(pixel: LedgerPixel): Promise<string[]> {
  const cells = await momentsOf(pixel);
  return [...new Set(cells.map((c) => c.owner).filter((o) => o.length > 0))].sort();
}

/**
 * Canonical digest of one cell. Length-prefixed so no field can absorb a
 * delimiter — `description` is attacker-controlled text.
 */
export async function litCellDigest(cell: LitCell): Promise<Hex> {
  const parts = [
    String(cell.pixelIndex),
    String(cell.cellIndex),
    cell.kind,
    cell.owner,
    cell.txid,
    String(cell.amount),
    cell.meaning.description ?? "",
    cell.meaning.reference ?? "",
    cell.meaning.recipientLabel ?? "",
  ];
  return sha512Hex(`lit-cell|v1|${parts.map((p) => `${p.length}:${p}`).join("|")}`);
}

/** Commitment over a pixel's cells, in block order. */
export async function litCellsRoot(cells: LitCell[]): Promise<Hex> {
  const digests: string[] = [];
  for (const cell of cells) digests.push(await litCellDigest(cell));
  return sha512Hex(`lit-cells|v1|${digests.length}|${digests.join("|")}`);
}

/** Root for a whole pixel, derived from the pixel alone. */
export async function pixelAuthorshipRoot(pixel: LedgerPixel): Promise<Hex> {
  return litCellsRoot(await litCellsOf(pixel));
}

export function litCellThesis(): {
  records: string;
  distinguishes: string;
  notCommitted: string;
} {
  return {
    records:
      "A pixel is position, moment, meaning — and whose. The author is derived from the transaction that lit the cell, not from the node that ordered it.",
    distinguishes:
      "One light_reward cell is the sequencer's wage for ordering; each moment cell belongs to the person who lived it. Two roles, one asset, no second token.",
    notCommitted:
      "Derived and recomputable by anyone from the same pixel, but not bound into the signed PoLS payload — so it is not consensus-enforced. Binding it is a consensus change and is not claimed here.",
  };
}

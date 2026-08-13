/**
 * Where each PIX came from.
 *
 * The UTXO model already records this — every output references the transaction
 * that made it, and that transaction is signed by whoever authored it. Nothing
 * needs storing; it needs asking.
 *
 * Two rules in docs/GIFT-AND-RECORD.md depend on being able to ask:
 *
 *   - **One gift per ordered pair, ever.** Answerable as "has A ever given to B",
 *     which is a question about history rather than a counter someone maintains.
 *     A counter in node memory forgets on restart, and a faucet that forgets is a
 *     faucet with no limit.
 *   - **A record needs light from three distinct givers.** Faking that needs a real
 *     social graph, because provenance is the thing being checked and free
 *     addresses do not manufacture it.
 *
 * It also answers the ticket question without a ticket database: does this address
 * hold unspent light that came from the promoter? Anyone can check, which is what
 * makes a dispute at the door something you look up rather than argue about.
 */

import type { LedgerPixel, PixelChainState } from "./chain";
import { authorOf } from "./lit-cell";
import type { Transaction, Utxo } from "./transaction";

export interface LightOrigin {
  /** The unspent output. */
  utxo: Utxo;
  /** Who authored the transaction that created it, or null for a coinbase. */
  giver: string | null;
  /** True when this light was minted rather than given — a sequencer's wage. */
  minted: boolean;
  pixelIndex: number;
}

function indexTransactions(pixels: LedgerPixel[]): Map<string, { tx: Transaction; at: number }> {
  const byTxid = new Map<string, { tx: Transaction; at: number }>();
  for (const pixel of pixels) {
    for (const tx of pixel.transactions) byTxid.set(tx.txid, { tx, at: pixel.index });
  }
  return byTxid;
}

/**
 * Trace every unspent output an address holds back to whoever gave it.
 *
 * Outputs whose creating transaction is missing from the chain are omitted rather
 * than reported with a null giver — an unknown origin must not read the same as a
 * coinbase, or "minted" becomes a hiding place.
 */
export async function lightHeldBy(state: PixelChainState, address: string): Promise<LightOrigin[]> {
  const byTxid = indexTransactions(state.pixels);
  const held: LightOrigin[] = [];
  for (const utxo of state.utxos.values()) {
    if (utxo.address !== address) continue;
    const found = byTxid.get(utxo.txid);
    if (!found) continue;
    const minted = found.tx.inputs.length === 0;
    held.push({
      utxo,
      giver: minted ? null : await authorOf(found.tx),
      minted,
      pixelIndex: found.at,
    });
  }
  return held;
}

/** Distinct people whose light this address currently holds. Excludes mints. */
export async function giversOf(state: PixelChainState, address: string): Promise<Set<string>> {
  const givers = new Set<string>();
  for (const origin of await lightHeldBy(state, address)) {
    if (origin.giver && origin.giver !== address) givers.add(origin.giver);
  }
  return givers;
}

/**
 * Has `from` ever given to `to`? Read from history, so a restart cannot forget.
 *
 * Counts any transaction authored by `from` that paid `to` — spent or not. A gift
 * that was received and then spent still happened, and the pair limit is about the
 * act rather than about what survives of it.
 */
export async function hasGifted(
  state: PixelChainState,
  from: string,
  to: string,
): Promise<boolean> {
  if (from === to) return false;
  for (const pixel of state.pixels) {
    for (const tx of pixel.transactions) {
      if (tx.inputs.length === 0) continue;
      if (!tx.outputs.some((o) => o.address === to)) continue;
      if ((await authorOf(tx)) === from) return true;
    }
  }
  return false;
}

/**
 * Does this address hold unspent light that came from `issuer`?
 *
 * The ticket check. Unspent and still where it was received, so it cannot be
 * transferred to let someone else in — spend it and you no longer hold it.
 */
export async function holdsLightFrom(
  state: PixelChainState,
  address: string,
  issuer: string,
): Promise<boolean> {
  for (const origin of await lightHeldBy(state, address)) {
    if (origin.giver === issuer) return true;
  }
  return false;
}

export function provenanceThesis(): { already: string; enables: string; limit: string } {
  return {
    already:
      "Nothing is stored for this. Every output references the transaction that made " +
      "it, and that transaction is signed — so the chain already knows where each " +
      "PIX came from and only needed asking.",
    enables:
      "One gift per ordered pair, three distinct givers for a record, and a ticket " +
      "that is checked by looking rather than by trusting a database.",
    limit:
      "It names the address that authored a transaction, not the person. Provenance " +
      "proves light came from a distinct source, never that the source is a human.",
  };
}

/**
 * The door on the mempool.
 *
 * ## What was wrong
 *
 * `POST /tx` is public and unauthenticated, which is correct — it is how a phone
 * wallet sends money. What it did with what arrived was not. The body was checked
 * for *shape* by zod and then handed to `submitTxLocked`, which deduplicated on
 * txid, appended to `pending`, gossiped it, and persisted it. No signature check.
 * No check that the sender owned anything. No cap on how much could accumulate. No
 * rate limit anywhere.
 *
 * `pending` is part of `serializeChain`, so every submission rewrote it to the one
 * Railway volume that holds the only copy of history. Junk never reached a block —
 * `selectSpendableTxs` drops the unspendable at production time — but nothing ever
 * removed it from `pending` either, because the only cleanup removes transactions
 * that were *included or conflicted*. Junk is neither, so it accumulated forever,
 * and unique txids defeat the deduplication. A `curl` loop, no key required.
 *
 * That last detail is also a correctness bug wearing a denial-of-service costume:
 * an unspendable transaction parked in the mempool permanently, forever proposed
 * and forever dropped. Admitting only what could actually be included fixes both.
 *
 * ## The order of the checks is the defence
 *
 * Cheapest first, so the expensive post-quantum verification is reached only by
 * something that already looks like a real spend:
 *
 *   1. identity — a free hash, rejects malformed junk outright
 *   2. shape    — no coinbase submissions, bounded metadata
 *   3. capacity — duplicate, then mempool ceiling
 *   4. state    — inputs exist, are unspent, and are not already reserved
 *   5. value    — outputs are positive safe integers and do not exceed inputs
 *   6. **authorization** — signature valid AND the key owns the coin
 *   7. one-time keys — the OTS leaf is not already burned on-chain or in flight
 *
 * Step 6 is the real gate. Steps 1-5 exist so that reaching it costs an attacker
 * more than it costs us.
 *
 * ## One door, two entrances
 *
 * HTTP `/tx` and the `tx` gossip message both come through here. Hardening one and
 * not the other would be theatre: the same flood, a different port. That is why
 * this lives in `lib` rather than in the HTTP server.
 */

import { outputTotalOf, utxoKey, type PixelChainState } from "./chain";
import { assertAndMergeOtsLeaves, collectOtsUsages } from "./chain";
import { MAX_METADATA_BYTES, MAX_PENDING_TX } from "./limits";
import {
  txIdentityProblem,
  verifyTransactionSignaturesForOwners,
  type Transaction,
} from "./transaction";

/** Why a transaction was refused, and whether the sender can do anything about it. */
export type MempoolRejectionCode =
  | "duplicate"
  | "identity"
  | "shape"
  | "metadata-too-large"
  | "mempool-full"
  | "unknown-input"
  | "input-reserved"
  | "input-repeated"
  | "value"
  | "unauthorized"
  | "ots-leaf-consumed";

export class MempoolRejected extends Error {
  constructor(
    readonly code: MempoolRejectionCode,
    message: string,
  ) {
    super(message);
    this.name = "MempoolRejected";
  }
}

/**
 * Would this transaction be admitted? Throws `MempoolRejected` if not.
 *
 * Read-only: it never mutates state. The caller appends on success, so admission
 * and insertion stay separable and this can be used as a dry run.
 *
 * `duplicate` is thrown rather than returned quietly so a caller cannot mistake "we
 * already have it" for "we took it"; the HTTP layer maps it to a success-shaped
 * response because for the sender it means the same thing.
 */
export async function assertAdmissible(state: PixelChainState, tx: Transaction): Promise<void> {
  // 1 — identity. Free, and it removes malformed junk before anything expensive.
  //     Not sufficient alone: an attacker can hash its own junk correctly.
  const identity = await txIdentityProblem(tx);
  if (identity) {
    throw new MempoolRejected(
      "identity",
      `Transaction identity does not match content: ${identity}`,
    );
  }

  // 2 — shape. A transaction with no inputs is a mint. Mints are produced by the
  //     elected sequencer inside a block, never submitted from outside.
  if (tx.inputs.length === 0) {
    throw new MempoolRejected(
      "shape",
      "A transaction with no inputs is a coinbase; those are minted by the elected " +
        "sequencer, not submitted",
    );
  }
  const metadataBytes = JSON.stringify(tx.metadata ?? {}).length;
  if (metadataBytes > MAX_METADATA_BYTES) {
    throw new MempoolRejected(
      "metadata-too-large",
      `Metadata is ${metadataBytes} bytes, over the ${MAX_METADATA_BYTES} byte limit`,
    );
  }

  // 3 — capacity.
  if (state.pending.some((p) => p.txid === tx.txid)) {
    throw new MempoolRejected("duplicate", "Already in the mempool");
  }
  if (state.pending.length >= MAX_PENDING_TX) {
    throw new MempoolRejected(
      "mempool-full",
      `Mempool is full (${MAX_PENDING_TX}); try again once the tip advances. Refused rather ` +
        `than evicting a valid transaction someone was already told had been sent`,
    );
  }

  // 4 — state. Inputs must exist, be unspent, and not already be committed by
  //     something waiting in the mempool.
  const reserved = new Set<string>();
  for (const pendingTx of state.pending) {
    for (const input of pendingTx.inputs) reserved.add(utxoKey(input.txid, input.vout));
  }
  const seen = new Set<string>();
  let inputTotal = 0;
  for (const input of tx.inputs) {
    const key = utxoKey(input.txid, input.vout);
    if (seen.has(key)) {
      throw new MempoolRejected("input-repeated", `Input ${key} is referenced twice`);
    }
    seen.add(key);
    const utxo = state.utxos.get(key);
    if (!utxo) {
      throw new MempoolRejected("unknown-input", `Input ${key} does not exist or is already spent`);
    }
    if (reserved.has(key)) {
      throw new MempoolRejected(
        "input-reserved",
        `Input ${key} is already spent by a pending transaction`,
      );
    }
    inputTotal += utxo.amount;
  }

  // 5 — value. `outputTotalOf` is the same function consensus uses, so the mempool
  //     cannot disagree with a block about what a valid amount is.
  let outputTotal: number;
  try {
    outputTotal = outputTotalOf(tx);
  } catch (err) {
    throw new MempoolRejected("value", err instanceof Error ? err.message : String(err));
  }
  if (outputTotal > inputTotal) {
    throw new MempoolRejected(
      "value",
      `Value not conserved (outputs ${outputTotal} > inputs ${inputTotal})`,
    );
  }

  // 6 — authorization. The actual gate: the signature verifies *and* the key
  //     commits to the address that owns each coin being spent. Current-era rules,
  //     because a transaction arriving now is being written into a new block.
  const authorized = await verifyTransactionSignaturesForOwners(
    tx,
    (txid, vout) => state.utxos.get(utxoKey(txid, vout))?.address,
  );
  if (!authorized) {
    throw new MempoolRejected(
      "unauthorized",
      "Signature is invalid, or the signing key is not the owner of an input",
    );
  }

  // 7 — one-time keys. A hash-OTS leaf is single-use at consensus, so a leaf
  //     already burned on-chain or promised by a pending transaction must not be
  //     accepted twice. Catching it here means the reuse is refused at the door
  //     rather than becoming a block that cannot be produced.
  try {
    const alreadyPromised = assertAndMergeOtsLeaves(
      state.usedOtsLeaves,
      collectOtsUsages(state.pending),
    );
    assertAndMergeOtsLeaves(alreadyPromised, collectOtsUsages([tx]));
  } catch (err) {
    throw new MempoolRejected(
      "ots-leaf-consumed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Admit a transaction, returning the new state. Throws `MempoolRejected` otherwise.
 *
 * Kept next to the check so no caller can validate against one state and insert
 * into another.
 */
export async function admitTransaction(
  state: PixelChainState,
  tx: Transaction,
): Promise<PixelChainState> {
  await assertAdmissible(state, tx);
  const reservedInputs = new Set(state.reservedInputs ?? []);
  for (const input of tx.inputs) reservedInputs.add(utxoKey(input.txid, input.vout));
  return {
    ...state,
    pending: [...state.pending, tx],
    reservedInputs,
    pendingSince: state.pending.length === 0 ? Date.now() : (state.pendingSince ?? Date.now()),
  };
}

export function mempoolPolicyThesis(): {
  maxPending: number;
  onFull: string;
  order: string[];
  oneDoor: string;
} {
  return {
    maxPending: MAX_PENDING_TX,
    onFull:
      "Refuse, never evict. Evicting a valid transaction a wallet already reported as sent " +
      "is a failure that renders as an ordinary state, and the user acts on it.",
    order: [
      "identity (free hash)",
      "shape + metadata bound",
      "duplicate, then capacity",
      "inputs exist, unspent, unreserved",
      "outputs positive and conserved",
      "AUTHORIZATION — signature valid and key owns the coin",
      "OTS leaf not already burned or in flight",
    ],
    oneDoor:
      "HTTP /tx and the tx gossip message share this function. Hardening one door and not " +
      "the other is the same flood on a different port.",
  };
}

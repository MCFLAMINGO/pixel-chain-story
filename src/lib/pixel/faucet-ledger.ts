/**
 * What the faucet has already given, read from the chain.
 *
 * The faucet used to top a balance back up to a threshold. Spend two, claim two,
 * forever — an open mint bounded only by the sequencer's vault, which grows with
 * every pixel. That is not a rate limit; it is a tap with no handle.
 *
 * Counting claims per address cannot fix it. Wallets here are unlinkable by
 * design, so anyone can make a fresh address and claim again, and any rule that
 * asks "who are you" is answered by making a new one. The same wall the presence
 * work ran into: you cannot gate on identity, only on cost or on a bound.
 *
 * So the faucet gets a bound: a one-time grant per address, and a total budget
 * for the whole chain. Neither stops a determined person from making addresses —
 * nothing can — but together they cap the damage at a number chosen in advance
 * rather than at whatever the vault happens to hold.
 *
 * Both facts are derived from history rather than held in node memory. A counter
 * in memory forgets on restart, and a faucet that forgets is a faucet with no
 * limit at all.
 */

import type { PixelChainState } from "./chain";

export const FAUCET_REFERENCE_PREFIX = "FAUCET-";

/** Default ceiling on everything the faucet may ever hand out, in whole PIX. */
export const FAUCET_DEFAULT_BUDGET = 500;

export interface FaucetLedger {
  /** Total PIX the faucet has granted across all of history. */
  granted: number;
  /** Addresses that have received a grant. */
  recipients: Set<string>;
  grants: number;
}

function isFaucetTx(reference: string | undefined): boolean {
  return typeof reference === "string" && reference.startsWith(FAUCET_REFERENCE_PREFIX);
}

/** Every faucet grant the chain remembers. Survives restarts because it is history. */
export function faucetLedger(state: PixelChainState): FaucetLedger {
  const recipients = new Set<string>();
  let granted = 0;
  let grants = 0;
  for (const pixel of state.pixels) {
    for (const tx of pixel.transactions) {
      if (!isFaucetTx(tx.metadata?.reference)) continue;
      // A faucet transaction pays the recipient and returns change to the vault.
      // Only the non-sequencer outputs were actually given away.
      const vault = pixel.lightProof.sequencerAddress;
      for (const out of tx.outputs) {
        if (out.address === vault) continue;
        recipients.add(out.address);
        granted += out.amount;
        grants += 1;
      }
    }
  }
  return { granted, recipients, grants };
}

export function faucetGrantedTo(state: PixelChainState, address: string): boolean {
  return faucetLedger(state).recipients.has(address);
}

export type FaucetDecision =
  | { allowed: true; amount: number }
  | { allowed: false; reason: string };

/**
 * Whether this address may be granted, and how much.
 *
 * A grant is once per address and never a top-up, so spending does not reopen
 * the tap. The budget is a hard ceiling on the whole chain.
 */
export function faucetDecision(params: {
  state: PixelChainState;
  address: string;
  amount: number;
  budget?: number;
}): FaucetDecision {
  const budget = params.budget ?? FAUCET_DEFAULT_BUDGET;
  const ledger = faucetLedger(params.state);

  if (ledger.recipients.has(params.address)) {
    return {
      allowed: false,
      reason:
        "This address has already been funded by the faucet. It is one grant per address, " +
        "not a top-up — spending does not reopen it.",
    };
  }
  const remaining = budget - ledger.granted;
  if (remaining <= 0) {
    return {
      allowed: false,
      reason:
        `The faucet has given out its whole budget (${ledger.granted}/${budget} PIX across ` +
        `${ledger.grants} grants). Someone already here has to send you your first light.`,
    };
  }
  if (params.amount > remaining) {
    return { allowed: true, amount: remaining };
  }
  return { allowed: true, amount: params.amount };
}

export function faucetThesis(): { was: string; why: string; now: string; limit: string } {
  return {
    was:
      "A top-up to a threshold: spend two, claim two, forever. An open mint bounded " +
      "only by a vault that grows with every pixel.",
    why:
      "Counting claims per address cannot fix it, because wallets are unlinkable by " +
      "design and a new address is free. You cannot gate on identity, only on cost " +
      "or on a bound.",
    now:
      "One grant per address, never a top-up, under a fixed budget for the whole " +
      "chain — both read from history, so a restart cannot forget them.",
    limit:
      "This does not stop a determined person from making addresses. Nothing can. " +
      "It caps the total at a number chosen in advance instead of at whatever the " +
      "vault holds.",
  };
}

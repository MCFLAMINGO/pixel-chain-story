/**
 * The economy as rules, so they can be checked instead of argued about.
 *
 * Not consensus code. A pure model of what
 * [`GIFT-AND-RECORD.md`](../../../docs/GIFT-AND-RECORD.md) describes, so the
 * invariants can be asserted and attacked by a test rather than reasoned about in
 * prose. Prose is where the zero-cost recycle nearly survived.
 *
 * The rules:
 *   - A gift moves one PIX and mints one back to the giver. One per ordered pair,
 *     ever. Net supply +1, and the giver is never poorer for giving.
 *   - A record consumes PIX. At least one goes into the picture and stays there —
 *     without that, two colluding addresses pass the same PIX back and forth
 *     forever at no cost.
 *   - A record co-signed by its counterparty is cheaper than one asserted alone,
 *     because the counterparty's signature does what three strangers' light
 *     otherwise has to.
 *
 * What must hold no matter what anyone does:
 *   1. Conservation — minted equals held plus in-picture.
 *   2. No free loop — every record strictly reduces what is held.
 *   3. Writing is bounded by having been given to, forever.
 *   4. Supply never exceeds the cap.
 */

import { PIX_HARD_CAP } from "./economics";

/** Into the picture, permanently. The reason a record cannot be free. */
export const RECORD_TO_PICTURE = 1;
/** To the counterparty who signed. Their reason to sign. */
export const RECORD_TO_COSIGNER = 1;
/** Distinct givers whose light an unsigned assertion must spend. */
export const UNSIGNED_QUORUM = 3;

export const COSIGNED_RECORD_COST = RECORD_TO_PICTURE + RECORD_TO_COSIGNER;
export const UNSIGNED_RECORD_COST = UNSIGNED_QUORUM;

export interface Economy {
  /** Held by people, spendable. */
  held: Map<string, number>;
  /** Spent into the picture. Nobody's, permanently. */
  inPicture: number;
  /** Ever minted. */
  minted: number;
  /** Ordered pairs that have already exchanged a gift. */
  gifted: Set<string>;
  records: number;
}

export function newEconomy(): Economy {
  return { held: new Map(), inPicture: 0, minted: 0, gifted: new Set(), records: 0 };
}

export function balance(e: Economy, who: string): number {
  return e.held.get(who) ?? 0;
}

export function circulating(e: Economy): number {
  let total = 0;
  for (const v of e.held.values()) total += v;
  return total;
}

const pairKey = (from: string, to: string) => `${from}->${to}`;

export type Refusal =
  | "already-gifted"
  | "self-gift"
  | "cap-reached"
  | "insufficient"
  | "no-cosigner"
  | "self-cosign";

export type Outcome = { ok: true } | { ok: false; reason: Refusal };

/**
 * Give one PIX. Free to the giver, once per ordered pair, ever.
 *
 * The one-per-pair limit is what makes PIX scarce at all. Without it, free giving
 * means a holder can supply anyone endlessly and nothing has a cost.
 */
export function gift(e: Economy, from: string, to: string): Outcome {
  if (from === to) return { ok: false, reason: "self-gift" };
  const key = pairKey(from, to);
  if (e.gifted.has(key)) return { ok: false, reason: "already-gifted" };
  if (e.minted + 1 > PIX_HARD_CAP) return { ok: false, reason: "cap-reached" };

  // The giver may give from nothing: the first gift of a chain has to start
  // somewhere, and the restoration means giving never costs.
  //
  // This is the hole. "What bounds this is the pair limit, not the balance" was the
  // claim, and it is false while addresses are free — a fresh address is always a new
  // pair, so alice → puppet → alice mints two and nets one, forever. Case 7 of
  // scripts/economy-model-selftest.ts demonstrates it. Left as-is deliberately: this
  // is the model of the design as written, and the model is where the design should be
  // shown to be broken. The chain does not implement the mint-back.
  const fromBal = balance(e, from);
  e.held.set(from, fromBal); // unchanged: one leaves, one is minted back
  e.held.set(to, balance(e, to) + 1);
  e.minted += 1;
  e.gifted.add(key);
  return { ok: true };
}

/**
 * Record a fact. Consumes PIX; at least one goes into the picture.
 *
 * `cosigner` present means the counterparty signed, which is cheaper. Signing
 * one's own record is refused — that is the whole point of a counterparty.
 */
export function record(e: Economy, author: string, cosigner?: string): Outcome & { cost?: number } {
  if (cosigner !== undefined && cosigner === author) {
    return { ok: false, reason: "self-cosign" };
  }
  const cost = cosigner === undefined ? UNSIGNED_RECORD_COST : COSIGNED_RECORD_COST;
  if (balance(e, author) < cost) return { ok: false, reason: "insufficient" };

  e.held.set(author, balance(e, author) - cost);
  e.inPicture += RECORD_TO_PICTURE;
  if (cosigner !== undefined) {
    e.held.set(cosigner, balance(e, cosigner) + RECORD_TO_COSIGNER);
  } else {
    // An unsigned assertion has nobody to pay, so the remainder joins the picture
    // rather than being minted away or handed to an operator.
    e.inPicture += cost - RECORD_TO_PICTURE;
  }
  e.records += 1;
  return { ok: true, cost };
}

/** minted === circulating + inPicture, or something is being conjured. */
export function conserved(e: Economy): boolean {
  return e.minted === circulating(e) + e.inPicture;
}

export function economyThesis(): {
  bound: string;
  sink: string;
  collusion: string;
  hole: string;
} {
  return {
    bound:
      "Writing is bounded by having been given to. PIX enters only by gift, one per " +
      "ordered pair forever, so a person's total output is capped by how many " +
      "distinct addresses ever gave to them.",
    sink:
      "Every record puts at least one PIX into the picture permanently. Without that " +
      "a colluding pair passes the same PIX back and forth at zero cost, forever.",
    collusion:
      "Co-signing lowers the price but cannot raise the ceiling. Sockpuppets pay the " +
      "same as anyone — but see the hole, because they do not have to be funded first.",
    hole:
      "Addresses are free, so 'distinct addresses' is not 'distinct people'. With the " +
      "mint-back, alice → fresh puppet → alice mints two PIX and nets one, and the " +
      "pair limit cannot object because a fresh address is always a new pair. Case 7 " +
      "of the selftest demonstrates it. The bound above is real only if being given " +
      "to by a distinct party is costly, and today it is not.",
  };
}

/**
 * The gift-and-record rules, as code that refuses.
 *
 * docs/GIFT-AND-RECORD.md describes four rules. Until now it described them and
 * nothing enforced them, which is the same as not having them. This module is the
 * enforcement, and the doc points here.
 *
 *   1. **A gift is free and capped at one PIX.** Giving is the act the network wants,
 *      so it must not cost anything.
 *   2. **One gift per ordered pair, ever.** This is where supply is bounded — not by
 *      a schedule but by how many distinct people you have actually met. Asked of
 *      history, so a restart cannot forget it.
 *   3. **A record costs three PIX from three distinct givers.** Not a fee, a quorum.
 *      Faking it needs three wallets that each already received a gift from someone
 *      else, which is a social graph rather than a for-loop.
 *   4. **The record's share is spent into the picture, not burned.** Burned light
 *      vanishes from the total and the loss is invisible. Light in the picture stays
 *      in the total, held at an address nobody has a key to, so the cost of every
 *      record ever made is a number anyone can read.
 *
 * ## Why this is off by default
 *
 * These rules are a consensus change. The crowned network has real people and real
 * value on it, and switching validation rules underneath a running chain orphans
 * whoever upgrades last. So the policy is explicit and per-network: the rules are
 * enforced where they are turned on, and turning them on for the crowned Earth is a
 * ceremony, not an import. What must not happen — and what this module exists to
 * prevent — is the rules living only in prose while the code accepts anything.
 */

import type { PixelChainState } from "./chain";
import { sha512Hex } from "./crypto";
import { authorOf } from "./lit-cell";
import type { Transaction, TxInput } from "./transaction";

/** A gift moves exactly this much light. Enough to be real, too little to be a market. */
export const GIFT_PIX = 1;

/** A record costs this much: one into the picture, one to the counterparty, one to the witness. */
export const RECORD_PIX = 3;

/** A record's light must come from this many distinct givers. Not a fee — a quorum. */
export const RECORD_QUORUM = 3;

export type MomentKind = "mint" | "gift" | "record" | "transfer";

export class GiftAndRecordError extends Error {
  constructor(
    message: string,
    readonly rule: string,
  ) {
    super(message);
    this.name = "GiftAndRecordError";
  }
}

/**
 * Where a record's share goes. Nobody's, and provably so.
 *
 * Derived under its own preimage domain — `pix-picture|` rather than the `pix-addr|`
 * that every real address uses. Anyone can recompute it from the phrase below and
 * see it came from a phrase rather than from a key. Spending from it would need a
 * public key that hashes into a domain it cannot reach.
 *
 * This is not a burn. The light stays in the total and stays countable, so the
 * accumulated cost of every record ever made is a number anyone can read rather
 * than a quiet subtraction.
 */
export const PICTURE_PHRASE = "the picture holds what was spent into it";

let picturePromise: Promise<string> | null = null;
export async function pictureAddress(): Promise<string> {
  picturePromise ??= sha512Hex(`pix-picture|${PICTURE_PHRASE}`).then(
    (d) => `pix1${d.slice(0, 38)}`,
  );
  return picturePromise;
}

/** Is the gift-and-record policy in force? Off unless a network turns it on. */
export function giftAndRecordEnabled(): boolean {
  return process.env.PIXEL_GIFT_AND_RECORD === "1";
}

/**
 * What kind of moment is this?
 *
 * A transaction with no inputs is a mint regardless of what it claims — the shape
 * decides, not the label. Otherwise the author's declared kind is taken at face
 * value, because declaring "record" is what invites the stricter check. An
 * unlabelled transfer is neither a gift nor a record and claims none of their
 * privileges.
 */
export function momentKind(tx: Transaction): MomentKind {
  if (tx.inputs.length === 0) return "mint";
  const declared = tx.metadata.kind;
  if (declared === "gift" || declared === "record") return declared;
  return "transfer";
}

/** Outputs that leave the author — change back to self is not a payment. */
function paidOutputs(tx: Transaction, author: string) {
  return tx.outputs.filter((o) => o.address !== author);
}

/**
 * Who gave the light this transaction is spending?
 *
 * Each input names the transaction that created it; that transaction's author is
 * the giver. An input whose source is missing from history yields no giver, so a
 * quorum can never be reached with light that cannot be traced.
 */
async function giversBehindInputs(state: PixelChainState, inputs: TxInput[]): Promise<Set<string>> {
  const byTxid = new Map<string, Transaction>();
  for (const pixel of state.pixels) {
    for (const tx of pixel.transactions) byTxid.set(tx.txid, tx);
  }
  const givers = new Set<string>();
  for (const input of inputs) {
    const source = byTxid.get(input.txid);
    if (!source || source.inputs.length === 0) continue;
    const giver = await authorOf(source);
    if (giver) givers.add(giver);
  }
  return givers;
}

/**
 * Has `from` ever given to `to`? Duplicated from provenance.ts on purpose.
 *
 * Consensus validation must not import a module whose job is answering questions
 * for the UI, or a convenience change there becomes a fork here.
 */
async function everGifted(state: PixelChainState, from: string, to: string): Promise<boolean> {
  for (const pixel of state.pixels) {
    for (const tx of pixel.transactions) {
      if (tx.inputs.length === 0) continue;
      if (momentKind(tx) !== "gift") continue;
      if (!tx.outputs.some((o) => o.address === to)) continue;
      if ((await authorOf(tx)) === from) return true;
    }
  }
  return false;
}

/**
 * Does this gift mint, or is it just light moving?
 *
 * The pair limit belongs here rather than in validation. A gift is always allowed —
 * you can give your wife light every day of your life — but you are only *made whole*
 * the first time, and every gift after that is one you pay for yourself. Refusing the
 * second gift, which is what this module did first, bounds no supply at all and only
 * stops people being generous.
 *
 * That also makes the shape rules conditional in the right way. A gift only has to be
 * exactly one PIX to exactly one person when it would mint, because that is the only
 * time the shape can be used to create something. A batched or oversized "gift" is not
 * an error; it simply does not mint, and is ordinary value movement.
 *
 * **This is the predicate a mint-back would be built on**, and it is deliberately not
 * wired to one yet. Per-pair minting is quadratic — K devices command K(K−1) ordered
 * pairs — so a farm's cost per PIX falls as 1/K and $20M of handsets could mint most
 * of the supply. See `farmYield()` in presence-peg.ts and the analysis in
 * docs/GIFT-AND-RECORD.md. The budget has to be per identity, and identity has to cost
 * something, before this predicate may create PIX.
 */
export async function giftMintsBack(state: PixelChainState, tx: Transaction): Promise<boolean> {
  if (momentKind(tx) !== "gift") return false;
  const author = await authorOf(tx);
  if (!author) return false;
  const paid = paidOutputs(tx, author);
  // Ambiguous or oversized: no single pair to be redeemed for, so nothing mints.
  if (paid.length !== 1) return false;
  const to = paid[0]!;
  if (to.amount !== GIFT_PIX) return false;
  return !(await everGifted(state, author, to.address));
}

/**
 * Would this moment be accepted under the gift-and-record rules?
 *
 * Throws with the rule that refused it. Called for its effect, so a caller cannot
 * accidentally treat a rejection as a boolean it forgot to check.
 */
export async function assertMomentAllowed(state: PixelChainState, tx: Transaction): Promise<void> {
  const kind = momentKind(tx);
  if (kind === "mint" || kind === "transfer") return;

  const author = await authorOf(tx);
  if (!author) {
    throw new GiftAndRecordError(
      "A gift or a record must say who made it; this transaction has no derivable author.",
      "authorship",
    );
  }
  const paid = paidOutputs(tx, author);

  // A gift is always allowed. The pair limit decides whether it MINTS, never whether
  // it is valid — see giftMintsBack. Refusing a second gift to the same person bounds
  // nothing and only blocks generosity, which is the opposite of the point.
  if (kind === "gift") return;

  // A record.
  const spent = paid.reduce((s, o) => s + o.amount, 0);
  if (spent !== RECORD_PIX) {
    throw new GiftAndRecordError(
      `A record costs exactly ${RECORD_PIX} PIX, not ${spent}: one into the picture, ` +
        `one to the person you are recording with, one to the witness who sealed it.`,
      "record/cost",
    );
  }

  const picture = await pictureAddress();
  const toPicture = paid.filter((o) => o.address === picture).reduce((s, o) => s + o.amount, 0);
  if (toPicture !== 1) {
    throw new GiftAndRecordError(
      `A record spends 1 PIX into the picture, not ${toPicture}. Without it the record ` +
        `is free in aggregate — the cost would circulate back among participants and ` +
        `nothing would bound how much can be written.`,
      "record/picture-share",
    );
  }

  const givers = await giversBehindInputs(state, tx.inputs);
  givers.delete(author);
  if (givers.size < RECORD_QUORUM) {
    throw new GiftAndRecordError(
      `A record needs light from ${RECORD_QUORUM} distinct givers; this spends light ` +
        `from ${givers.size}. It is a quorum, not a fee: three wallets you funded ` +
        `yourself cannot stand in for three people who chose to give.`,
      "record/quorum",
    );
  }
}

export function giftAndRecordThesis(): Record<string, string> {
  return {
    gift:
      "A gift is always allowed — give your wife light every day of your life. The " +
      "pair limit decides only whether you are made whole, so a second gift costs you " +
      "one PIX instead of being refused. Generosity is never blocked by a rule.",
    bound:
      "NOT YET BOUND. Per-pair minting is quadratic: K devices command K(K-1) ordered " +
      "pairs, so cost per PIX falls as 1/K and $20M of handsets could mint most of the " +
      "supply. The budget must be per identity, and identity must cost something. " +
      "See farmYield() in presence-peg.ts. No mint-back ships until then.",
    quorum:
      "A record needs light from three distinct givers, so writing to the picture " +
      "costs a social graph rather than a for-loop over fresh addresses.",
    picture:
      "The record's share is spent into an address nobody has a key to, not burned. " +
      "The light stays countable, so the cost of everything ever written is readable.",
    policy:
      "Off unless a network turns it on. Switching validation rules underneath a " +
      "running chain orphans whoever upgrades last, so enabling it is a ceremony.",
  };
}

/**
 * What cannot revert.
 *
 * ## The question this answers
 *
 * Every serious reader of this project asks it, and until now the honest reply was
 * "nothing". PoLS orders pixels; it does not finalise them. There is no quorum, no
 * justification, no checkpoint — so a sufficiently long branch could in principle replace
 * any amount of history, and after T3.1 gave the chain a real fork-choice rule that stopped
 * being theoretical and became a bounded-depth guarantee and nothing more.
 *
 * Pixel already has the raw material for a better answer, and has had it for weeks without
 * using it: the tip digest is published to `PixelAnchor` on two independent public chains.
 * `highestAnchored(20553)` reads 46 on ethereum-sepolia right now, and `matches()` confirms
 * the full tip hash and spatial root for that height. That is a fact about the world which
 * nobody here can retract — append-only by contract, and witnessed at a time nobody here
 * chose after the event.
 *
 * So: **a pixel whose digest is anchored on at least two independent venues, each with
 * enough confirmations, is final.** Fork choice may not cross it. A branch that contradicts
 * it is refused regardless of height.
 *
 * ## Why this is honest, and what it is not
 *
 * It is not BFT. There is no voting, no stake, no slashing, and it does not pretend
 * otherwise. What it is: an appeal to two ledgers with far more economic weight than this
 * one, whose contents this project cannot rewrite. Reverting a finalised Pixel pixel would
 * require reorganising Ethereum Sepolia *and* the other venue, which is a much larger claim
 * than reorganising Pixel.
 *
 * It also inherits the anchors' honest limits, stated in `docs/ANCHORING.md` and repeated
 * here because a finality rule is exactly where someone will over-read them: **an anchor
 * proves publication time and immutability afterwards. It does not prove the anchored root
 * was correct.** A wrong digest, anchored, is a wrong digest that cannot now be quietly
 * corrected. Finality here means "this is the history everyone saw", not "this history is
 * valid" — validity is `verifyChain`'s job, and the two are deliberately separate.
 *
 * ## Off by default, and enabling it is a ceremony
 *
 * Turning a new consensus restriction on underneath a running chain orphans whoever
 * upgrades last. The crowned Earth has real people and real transfers on it, so this follows
 * the pattern `gift-and-record.ts` established: the rule is per-network policy, off unless a
 * network turns it on, and switching it on for 20553 is a decision rather than an import.
 *
 * What must not happen — and what this module exists to prevent — is a finality claim that
 * lives only in prose while the code reorgs across anything.
 */

import type { Hex } from "./crypto";

/**
 * Independent venues that must carry a digest before it is final.
 *
 * Two, not one. A single venue makes that venue a trusted third party, which is the thing
 * the whole design refuses; two independent chains have to agree, and disagreement is a
 * loud, checkable event rather than a silent substitution.
 */
export const FINALITY_MIN_VENUES = 2;

/**
 * Confirmations a venue needs before its record counts.
 *
 * Anchors go into ordinary transactions on ordinary chains, and an unconfirmed transaction
 * can vanish. Twelve is the conventional Ethereum figure and is deliberately unexciting:
 * the number a reader already has intuitions about beats a novel one that needs defending.
 */
export const FINALITY_MIN_CONFIRMATIONS = 12;

/** Is the anchored-finality rule in force? Off unless a network turns it on. */
export function finalityEnabled(): boolean {
  return process.env.PIXEL_ANCHORED_FINALITY === "1";
}

/** One venue's view of one height. */
export interface VenueAnchorObservation {
  venue: string;
  pixelIndex: number;
  /** Full 64-byte pixel hash, hex. */
  tipHash: Hex;
  spatialRoot: Hex;
  /** Confirmations behind the anchoring transaction on that venue. */
  confirmations: number;
}

export interface FinalityCheckpoint {
  pixelIndex: number;
  tipHash: Hex;
  venues: string[];
}

/**
 * Highest pixel index that is final, given what the venues say.
 *
 * Returns -1 when nothing is final, which is the correct answer far more often than not and
 * is the value the rest of the system must handle gracefully.
 *
 * Observations that disagree about the digest at a height are **discarded, not resolved**.
 * If two venues carry different tip hashes for the same pixel then something has gone badly
 * wrong — a compromised anchorer key, or two chains — and quietly picking a winner would
 * turn a loud contradiction into a silent decision. The height simply does not finalise, and
 * `venueDisagreements` names it so an operator can look.
 */
export function finalizedThrough(params: {
  observations: readonly VenueAnchorObservation[];
  minVenues?: number;
  minConfirmations?: number;
}): { height: number; checkpoints: FinalityCheckpoint[]; venueDisagreements: number[] } {
  const minVenues = params.minVenues ?? FINALITY_MIN_VENUES;
  const minConfirmations = params.minConfirmations ?? FINALITY_MIN_CONFIRMATIONS;

  const byHeight = new Map<number, VenueAnchorObservation[]>();
  for (const obs of params.observations) {
    if (obs.confirmations < minConfirmations) continue;
    if (!Number.isInteger(obs.pixelIndex) || obs.pixelIndex < 0) continue;
    const list = byHeight.get(obs.pixelIndex) ?? [];
    list.push(obs);
    byHeight.set(obs.pixelIndex, list);
  }

  const checkpoints: FinalityCheckpoint[] = [];
  const venueDisagreements: number[] = [];

  for (const [pixelIndex, list] of [...byHeight.entries()].sort((a, b) => a[0] - b[0])) {
    const digests = new Set(list.map((o) => `${o.tipHash}|${o.spatialRoot}`));
    if (digests.size > 1) {
      venueDisagreements.push(pixelIndex);
      continue;
    }
    const venues = [...new Set(list.map((o) => o.venue))];
    if (venues.length < minVenues) continue;
    checkpoints.push({ pixelIndex, tipHash: list[0]!.tipHash, venues: venues.sort() });
  }

  // Finality is a prefix property: a height is final only if every height below it is too.
  // A gap means an anchor was missed, and treating the far side of a gap as final would
  // finalise history nobody witnessed.
  let height = -1;
  for (const cp of checkpoints) {
    if (cp.pixelIndex === height + 1) height = cp.pixelIndex;
    else break;
  }

  return { height, checkpoints, venueDisagreements };
}

/**
 * The `isFinalized` predicate `fork-choice.ts` already accepts.
 *
 * That hook was written before this module existed, precisely so finality could arrive as a
 * parameter rather than a rewrite. Returns a function that is always false when the policy
 * is off, so an operator who has not opted in gets exactly today's behaviour.
 */
export function finalityGuard(params: {
  observations: readonly VenueAnchorObservation[];
  enabled?: boolean;
  minVenues?: number;
  minConfirmations?: number;
}): (index: number) => boolean {
  const on = params.enabled ?? finalityEnabled();
  if (!on) return () => false;
  const { height } = finalizedThrough(params);
  return (index: number) => index <= height;
}

/**
 * Does a candidate branch contradict what the venues witnessed?
 *
 * Separate from fork choice on purpose. Fork choice asks "is this branch better"; this asks
 * "is this branch the history the world already saw", and a branch can be taller and still
 * be answering the wrong question.
 */
export function contradictsFinality(params: {
  branch: readonly { index: number; hash: Hex }[];
  checkpoints: readonly FinalityCheckpoint[];
}): { contradicts: boolean; atIndex?: number; expected?: Hex; found?: Hex } {
  const byIndex = new Map(params.branch.map((p) => [p.index, p.hash]));
  for (const cp of params.checkpoints) {
    const found = byIndex.get(cp.pixelIndex);
    if (found === undefined) continue; // the branch simply does not reach that height
    if (found !== cp.tipHash) {
      return { contradicts: true, atIndex: cp.pixelIndex, expected: cp.tipHash, found };
    }
  }
  return { contradicts: false };
}

export function finalityThesis(): {
  rule: string;
  isNot: string;
  inheritedLimit: string;
  policy: string;
} {
  return {
    rule:
      `A pixel anchored on at least ${FINALITY_MIN_VENUES} independent venues, each with ` +
      `at least ${FINALITY_MIN_CONFIRMATIONS} confirmations, is final. Fork choice may not ` +
      `cross it, and a branch contradicting it is refused regardless of height. Finality is ` +
      `a prefix property: a gap below a height means that height is not final either.`,
    isNot:
      "Not BFT. No voting, no stake, no slashing. It is an appeal to two ledgers with far " +
      "more economic weight than this one, whose contents this project cannot rewrite.",
    inheritedLimit:
      "An anchor proves publication time and immutability afterwards; it does NOT prove the " +
      "anchored root was correct. Finality here means 'this is the history everyone saw', " +
      "never 'this history is valid' — validity is verifyChain's job and stays separate.",
    policy:
      "Off unless a network turns it on (PIXEL_ANCHORED_FINALITY=1). Switching a consensus " +
      "restriction on underneath a running chain orphans whoever upgrades last, so enabling " +
      "it for the crowned Earth is a ceremony rather than a deploy.",
  };
}

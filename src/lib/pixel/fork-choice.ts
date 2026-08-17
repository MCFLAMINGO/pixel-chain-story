/**
 * Which chain wins, at any depth.
 *
 * ## What was here before
 *
 * `replaceTipIfBetter` handled exactly one case: a competing pixel at the *same height*
 * as our tip, whose parent is our tip's parent. Its own comment said so — "Depth-1 tip
 * replace... Lab only — not a reorg market."
 *
 * That is enough for one sequencer and no peers, which is what the chain has been. It is
 * not enough for two. Two honest operators partitioned for **two** pixels each extend
 * their own branch, and when the partition heals neither can accept the other: every
 * block the peer offers is at a height they already hold, and depth-1 replacement cannot
 * reach back past the divergence. They stay split forever, both convinced they are right,
 * both correct about their own history.
 *
 * A chain that cannot converge after a partition does not have a second operator. It has
 * two chains.
 *
 * ## The rule
 *
 * A branch is scored, and the highest score wins. In order:
 *
 *   1. **Height.** More light is more work observed. This is the primary rule and the
 *      other two exist only to break ties deterministically.
 *   2. **Fewer total skips.** A branch that was produced on time is preferred over one
 *      assembled through stalls, summed over the whole branch rather than judged at the
 *      tip — a branch that limped through five skips should not beat a punctual one just
 *      because its last pixel happened to be on time.
 *   3. **Lower tip hash.** Arbitrary, deterministic, and unbiasable by anyone who cannot
 *      grind the whole branch. Ties have to break *somehow*, and they must break the same
 *      way on every node.
 *
 * This is deliberately not stake-weighted or vote-based. There is no stake and there are
 * no votes; inventing a weight from something the chain cannot measure would be a
 * consensus rule resting on a number nobody can check.
 *
 * ## What it refuses
 *
 * **Depth.** A reorg deeper than `MAX_REORG_DEPTH` is refused outright rather than
 * applied. A node that has been offline for a month should not silently discard a month
 * of history because a stranger offered a marginally taller branch; it should say so and
 * let an operator look. Bounded damage beats automatic recovery when the failure mode is
 * "your ledger quietly changed".
 *
 * **Finalized history.** `isFinalized` is injected rather than assumed, and defaults to
 * "nothing is final". When a finality rule exists (anchored checkpoints — a separate,
 * fork-bearing decision) fork choice must refuse to cross it, and the interface for that
 * refusal is here already so the eventual change is a parameter rather than a rewrite.
 *
 * **Consumed one-time signatures.** The subtle one, and the reason this file is careful
 * rather than clever. A hash-OTS leaf revealed in a block that gets reorged away is
 * *still revealed* — the signature is public forever. Releasing it would reopen the
 * Lamport reuse window that `usedOtsLeaves` exists to close. So consumed leaves are
 * **append-only across reorgs of any depth**: the union of every leaf ever seen on any
 * branch survives, exactly as `replaceTipIfBetter` did at depth 1 (PIX-15). Transactions
 * from an orphaned branch are not re-queued either; their inputs become spendable again,
 * but the owner must re-sign with a fresh leaf.
 */

import { acceptBlock, type LedgerPixel, type PixelChainState } from "./chain";
import type { Hex } from "./crypto";

/**
 * Deepest reorg a node will apply on its own.
 *
 * Chosen to be comfortably larger than any plausible honest partition — at roughly one
 * pixel an hour, 64 is two and a half days of divergence — and far smaller than "however
 * much history a stranger would like me to discard".
 */
export const MAX_REORG_DEPTH = 64;

export interface BranchScore {
  height: number;
  /** Total skips over the whole branch, not just the tip's. */
  skips: number;
  tipHash: Hex;
}

export type ForkChoiceOutcome =
  | { kind: "extended"; state: PixelChainState; applied: number }
  | {
      kind: "reorged";
      state: PixelChainState;
      dropped: number;
      applied: number;
      forkHeight: number;
    }
  | { kind: "ignored"; reason: string }
  | { kind: "refused"; reason: string };

/** Score a chain of pixels. Higher wins; see the ordering note at the top of this file. */
export function scoreBranch(pixels: readonly LedgerPixel[]): BranchScore {
  let skips = 0;
  for (const p of pixels) skips += p.lightProof.skipCount ?? 0;
  const tip = pixels[pixels.length - 1];
  return {
    height: tip ? tip.index : -1,
    skips,
    tipHash: (tip?.hash ?? "") as Hex,
  };
}

/**
 * Is `candidate` a better branch than `current`?
 *
 * Total order, so every node reaches the same answer from the same two branches. Returns
 * false on an exact tie, because "no reason to move" must not become a coin flip that two
 * nodes flip differently.
 */
export function prefersBranch(candidate: BranchScore, current: BranchScore): boolean {
  if (candidate.height !== current.height) return candidate.height > current.height;
  if (candidate.skips !== current.skips) return candidate.skips < current.skips;
  return candidate.tipHash < current.tipHash;
}

/** Index of the last pixel `ours` and `theirs` agree on, or -1 if not even genesis. */
export function commonAncestorIndex(
  ours: readonly LedgerPixel[],
  theirs: readonly LedgerPixel[],
): number {
  const limit = Math.min(ours.length, theirs.length);
  let last = -1;
  for (let i = 0; i < limit; i++) {
    if (ours[i]!.hash !== theirs[i]!.hash) break;
    last = i;
  }
  return last;
}

/**
 * Roll a chain back to `keep` pixels, preserving what must not be released.
 *
 * The UTXO set is rebuilt by replaying the surviving pixels rather than by undoing the
 * dropped ones, because undo has to be exactly right and replay only has to be
 * deterministic. Consumed OTS leaves are carried forward untouched — see the note at the
 * top of this file; that is the invariant most likely to be broken by someone
 * "simplifying" this function.
 */
async function rollBackTo(state: PixelChainState, keep: number): Promise<PixelChainState> {
  const kept = state.pixels.slice(0, keep);
  const { stateFromPixels } = await import("./chain");
  const rebuilt = stateFromPixels(kept, state.sequencers, state.networkId);
  return {
    ...state,
    pixels: kept,
    utxos: rebuilt.utxos,
    // Append-only across reorgs of any depth (PIX-15). A revealed leaf is public
    // forever, so it can never become unrevealed by losing a race.
    usedOtsLeaves: new Set(state.usedOtsLeaves),
    pending: state.pending,
    pendingSince: state.pending.length ? (state.pendingSince ?? Date.now()) : undefined,
    reservedInputs: new Set(),
  };
}

/**
 * Consider a peer's branch and adopt it if the rules say it wins.
 *
 * `theirs` is the peer's pixels from genesis. Every block is re-validated by `acceptBlock`
 * on the way in — a reorg is not a shortcut past validation, and a taller branch of
 * invalid blocks must lose to a shorter valid one. That is why application is attempted
 * before the result is kept, and why a failure mid-way leaves the original state
 * untouched: the caller gets `refused` and keeps the chain it had.
 */
export async function considerBranch(params: {
  state: PixelChainState;
  theirs: readonly LedgerPixel[];
  /** Defaults to "nothing is finalized" until a finality rule exists. */
  isFinalized?: (index: number) => boolean;
  maxReorgDepth?: number;
}): Promise<ForkChoiceOutcome> {
  const { state, theirs } = params;
  const isFinalized = params.isFinalized ?? (() => false);
  const maxDepth = params.maxReorgDepth ?? MAX_REORG_DEPTH;

  if (theirs.length === 0) return { kind: "ignored", reason: "empty branch" };
  const ours = state.pixels;
  if (ours.length === 0) return { kind: "refused", reason: "local chain has no genesis" };

  if (theirs[0]!.hash !== ours[0]!.hash) {
    // Different genesis is a different Earth, not a longer chain. This is the one
    // rejection that must never be overridden by height.
    return { kind: "refused", reason: "different genesis — that is another chain, not a fork" };
  }

  const ourScore = scoreBranch(ours);
  const theirScore = scoreBranch(theirs);
  if (!prefersBranch(theirScore, ourScore)) {
    return {
      kind: "ignored",
      reason:
        `our branch is preferred (height ${ourScore.height} skips ${ourScore.skips} vs ` +
        `height ${theirScore.height} skips ${theirScore.skips})`,
    };
  }

  const fork = commonAncestorIndex(ours, theirs);
  if (fork < 0) return { kind: "refused", reason: "no common ancestor" };

  const dropped = ours.length - (fork + 1);
  if (dropped > maxDepth) {
    return {
      kind: "refused",
      reason:
        `reorg would drop ${dropped} pixels, over the ${maxDepth} limit — refusing rather ` +
        `than silently discarding history; an operator should look at this`,
    };
  }
  for (let i = fork + 1; i < ours.length; i++) {
    if (isFinalized(i)) {
      return {
        kind: "refused",
        reason: `reorg would cross finalized pixel #${i}`,
      };
    }
  }

  // Apply. A pure extension is the common case and skips the rollback entirely.
  let next = dropped === 0 ? state : await rollBackTo(state, fork + 1);
  let applied = 0;
  for (let i = next.pixels.length; i < theirs.length; i++) {
    try {
      next = await acceptBlock(next, theirs[i]!);
      applied++;
    } catch (err) {
      // A taller branch of invalid blocks loses to a shorter valid one. Nothing is
      // committed, so the caller keeps the chain it already had.
      return {
        kind: "refused",
        reason: `peer branch failed validation at #${i}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  if (applied === 0) return { kind: "ignored", reason: "nothing to apply" };
  if (dropped === 0) return { kind: "extended", state: next, applied };
  return { kind: "reorged", state: next, dropped, applied, forkHeight: fork };
}

export function forkChoiceThesis(): {
  order: string[];
  refusals: string[];
  invariant: string;
} {
  return {
    order: [
      "greater height",
      "then fewer total skips across the whole branch",
      "then lower tip hash — arbitrary, deterministic, identical on every node",
    ],
    refusals: [
      "a different genesis is another chain, never a longer one",
      `deeper than MAX_REORG_DEPTH (${MAX_REORG_DEPTH}) — refused, not applied`,
      "crossing a finalized pixel, once a finality rule exists",
      "a taller branch containing an invalid block loses to a shorter valid one",
    ],
    invariant:
      "Consumed one-time-signature leaves are append-only across reorgs of any depth. A " +
      "revealed Lamport leaf is public forever, so losing a race can never make it unrevealed.",
  };
}

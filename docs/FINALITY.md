# Finality — what cannot revert

**Status: mechanism shipped, policy off.** `PIXEL_ANCHORED_FINALITY=1` turns it on for a
network. It is **not** on for the crowned Earth, and turning it on there is a decision, not a
deploy. See [Enabling it](#enabling-it-is-a-ceremony).

## The question, and the answer that was missing

Every serious reader asks it, and until 17 August 2026 the honest reply was _nothing_.

PoLS orders pixels; it does not finalise them. There is no quorum, no justification, no
checkpoint. [`SPEC.md`](./SPEC.md) §4 says outright "This is not BFT." So a sufficiently long
branch could in principle replace any amount of history — and when [T3.1](#see-also) gave the
chain a real fork-choice rule over a block tree, that stopped being theoretical and became a
bounded-depth guarantee and nothing more. `MAX_REORG_DEPTH` refuses to _automatically_ discard
more than 64 pixels. It does not make 64 pixels irreversible.

The material for a better answer had been sitting there for weeks, unused. The tip digest is
published to `PixelAnchor` on two independent public chains. Right now:

```
ethereum-sepolia: highestAnchored(20553) = 46
                  matches(20553, 46, tipHash, spatialRoot) = true
```

That is a fact about the world which nobody here can retract. The contract is append-only —
a height can be written exactly once, so an anchorer cannot revise the past _even if its key
is later stolen_ — and it was witnessed at a time nobody here chose after the event.

## The rule

> A pixel whose digest is anchored on at least **2 independent venues**, each with at least
> **12 confirmations**, is **final**. Fork choice may not cross it. A branch contradicting it
> is refused regardless of height.

Three deliberate details:

**Two venues, not one.** One venue makes that venue a trusted third party, which is the thing
the whole design refuses. Two independent chains have to agree, and disagreement becomes a
loud checkable event rather than a silent substitution.

**Twelve confirmations.** Anchors ride in ordinary transactions on ordinary chains, and an
unconfirmed transaction can vanish. Twelve is the conventional Ethereum figure and is
deliberately unexciting — a number readers already have intuitions about beats a novel one
that needs defending.

**Finality is a prefix property.** A height is final only if every height below it is. A gap
means an anchor was missed, and finalising past a gap would freeze history nobody witnessed on
the strength of a later height that happens to be anchored.

## What it refuses to do

The interesting behaviour is the declining, because a finality rule that over-claims is worse
than none at all — it converts an unknown into a false certainty.

| Situation                                     | Result                                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| one venue reports a height                    | nothing final                                                 |
| the same venue reports twice                  | nothing final — that is one venue                             |
| a venue is below 12 confirmations             | that venue does not count                                     |
| **two venues report different digests**       | **nothing final, and the disagreement is reported by height** |
| tip hash matches but spatial root differs     | still a disagreement — the anchor commits to both             |
| an anchor is missing below an anchored height | finality stops below the gap                                  |

The disagreement case is the one that matters most. If two venues carry different digests for
one height, something has gone badly wrong — a compromised anchorer key, or two chains — and
quietly picking a winner would turn a loud contradiction into a silent decision. So nothing
finalises and `venueDisagreements` names the height.

## What this is not

**Not BFT.** No voting, no stake, no slashing, and it does not pretend otherwise. It is an
appeal to two ledgers with far more economic weight than this one, whose contents this project
cannot rewrite. Reverting a finalised Pixel pixel would require reorganising Ethereum Sepolia
_and_ the other venue, which is a far larger claim than reorganising Pixel.

**Not a validity proof.** This inherits the anchors' honest limit, repeated here because a
finality rule is exactly where someone will over-read it — from
[`ANCHORING.md`](./ANCHORING.md):

> Anchoring proves publication time and immutability afterwards. It does **not** prove the
> anchored root is correct.

A wrong digest, anchored, is a wrong digest that can no longer be quietly corrected. Finality
here means **"this is the history everyone saw"**, never "this history is valid". Validity is
`verifyChain`'s job and the two stay deliberately separate — which is also why
`bun run verify:crowned` reports replay, independent arithmetic, and anchor agreement as three
labelled steps rather than one verdict.

**Not a liveness guarantee.** Anchoring runs on a schedule (`cron 17 */6 * * *`). If it stops,
nothing new finalises. That degrades to today's behaviour rather than to a wrong answer, but it
does mean finality lags the tip by hours in the ordinary case and indefinitely if the anchor job
breaks. A finality rule whose dependency is a cron job should say so.

## Enabling it is a ceremony

Turning a new consensus restriction on underneath a running chain orphans whoever upgrades
last. The crowned Earth has real people and real transfers on it, so this follows the pattern
[`GIFT-AND-RECORD.md`](./GIFT-AND-RECORD.md) established: per-network policy, off unless a
network turns it on.

```bash
PIXEL_ANCHORED_FINALITY=1 bun run pixel -- node --datadir ./pixel-data
```

Before enabling it on network 20553, the things that should be true:

1. More than one operator, so finality is protecting something rather than decorating a
   single-writer chain. (`test:two-operator` proves succession works; a second _person_ is
   still the open item.)
2. Anchoring demonstrably current on both venues — `verify:crowned` confirming both, not one.
   Today robinhood-testnet is intermittently unreachable, which under this rule means nothing
   finalises at all.
3. Every operator enabling it in the same window, since a node with the rule and a node
   without it can disagree about whether a reorg is permitted.

Point 2 is the honest blocker. With one venue reachable, this rule finalises nothing — which is
correct, and is also why it ships off.

## Where it lives

| Piece                             | File                                                     |
| --------------------------------- | -------------------------------------------------------- |
| the rule and its refusals         | `src/lib/pixel/finality.ts`                              |
| the hook it fills in              | `isFinalized` in `src/lib/pixel/fork-choice.ts`          |
| tests, including every refusal    | `scripts/finality-selftest.ts` (`bun run test:finality`) |
| reading the anchors independently | `scripts/verify-crowned.ts` (`bun run verify:crowned`)   |

The `isFinalized` parameter was written into `fork-choice.ts` before this module existed,
precisely so finality could arrive as a parameter rather than a rewrite. `test:fork-choice`
already asserted that a reorg crossing it is refused; `test:finality` asserts that the thing
filling it in refuses in all the right places, and that a taller branch which _agrees_ with the
checkpoints is still adopted — finality must restrict reorgs, not freeze the chain.

## See also

- [`ANCHORING.md`](./ANCHORING.md) — what an anchor does and does not prove
- [`SPEC.md`](./SPEC.md) §4.1 — fork choice and the depth bound
- [`PATH.md`](./PATH.md) — where this sits relative to a second operator
- [`STATE-2026-08-17.md`](./STATE-2026-08-17.md) — why "no finality rule" was on the
  still-not-true list

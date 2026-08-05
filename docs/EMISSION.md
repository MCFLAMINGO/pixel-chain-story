# Emission — an open question, stated honestly

## The bug, which is settled

`PIX_HARD_CAP` is 21,000,000. The schedule can only ever mint **20,370,000**.

Bitcoin halves in satoshis, so it can halve 33 times and its series lands on
20,999,999.9769 BTC — a rounding error under its ceiling. `lightReward` halves
in **whole PIX**:

```
50 → 25 → 12 → 6 → 3 → 1 → 0
(50 + 25 + 12 + 6 + 3 + 1) × 210,000 = 20,370,000
```

Six halvings and it's dead. 630,000 PIX — 3% of the declared supply — can never
exist. The constants were inherited without the base unit that made them work.

`PIX_SCHEDULE_TOTAL` now states the real figure in code. `PIX_HARD_CAP` remains
as the ceiling `assertUnderCap` enforces, which is what it actually is.

The old `test:scale` asserted `50 × 210000 × 2 === 21_000_000` — the sum of an
*infinite* series. That is why this hid: the test checked a formula we believed
instead of the behaviour of the function.

## The question that is not settled

**Should there be a per-pixel emission at all?**

A block reward exists to buy security. Bitcoin needs one because mining is
expensive. PoLS is one signature and no grinding — roughly 9ms to sign, 4.6ms to
verify, measured. There is no expensive work to subsidise.

So the reward is inherited from a cost model this system does not have.

And PIX is already declared **not a peg, not redeemable, not a market cap**. If
it is not money, an emission schedule and a hard cap are vestigial organs from
the clone.

## What the token would actually be for

Not paying sequencers. **Rationing writes.**

Without a cost, anyone can light unlimited pixels and the record becomes noise.
That is the real function fees serve in every chain — not miner income, but
scarcity of the right to write.

Once framed that way, a token is only one of the available answers:

| Mechanism | Scarce resource | Notes |
| --- | --- | --- |
| Token fee | capital | conventional; requires the token to have value first, which is circular at genesis |
| Stake | capital | same circularity |
| Proof of personhood | identity | strong, hard to build |
| **Presence** | being somewhere with someone | already built here |

## Presence as the scarce resource

Kindling already rations by physics. You cannot be in a room with a thousand
people a second. The optical stack — pay faces, `PXP1-P`, presence seals — was
built as a payment ritual, but it is also a **rate limiter with a physical
floor**, and that is a use no other chain has available to it.

Honest limit, unchanged: a presence seal proves two optical captures were
combined, not that two humans were present. It can be spoofed by one person with
two screens. So presence is a rate limiter, not a hard bound, and it would need
pairing with something — a cost, a witness set, reputation — to be load-bearing.

## Why this is not decided here

Picking a reward number to keep existing tests passing would encode the mistake
rather than fix it. The candidate exact-and-flat schedules are:

| Reward | Horizon | At 30s blocks |
| --- | --- | --- |
| 1 PIX | 21,000,000 pixels | 20.0 years |
| 3 PIX | 7,000,000 pixels | 6.7 years |
| 21 PIX | 1,000,000 pixels | 1.0 year |
| 50 PIX | 420,000 pixels | 146 days |

Each reaches 21,000,000 exactly, with no unreachable remainder and no halving —
so "every moment is worth the same" becomes true rather than aspirational.

But choosing among them is a monetary decision, and the prior question is whether
there should be a schedule at all. That is a thesis decision, not an engineering
one, and it should be made deliberately rather than to satisfy a test suite
written against a schedule that never added up.

## What changed in code

- `mintedThrough` is a closed form over eras instead of a loop over pixels. It is
  called once per block by `validateAndApplyBlockTxs` and `verifyChain`, so the
  old version cost N²/2 iterations to validate an N-pixel chain — 5×10¹¹ at a
  million pixels. Values are identical; `test:scale` asserts equality against the
  loop.
- `PIX_SCHEDULE_TOTAL` states the reachable supply.
- No schedule change. No consensus change. The tip stays valid.

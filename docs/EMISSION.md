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
_infinite_ series. That is why this hid: the test checked a formula we believed
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

| Mechanism           | Scarce resource              | Notes                                                                              |
| ------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| Token fee           | capital                      | conventional; requires the token to have value first, which is circular at genesis |
| Stake               | capital                      | same circularity                                                                   |
| Proof of personhood | identity                     | strong, hard to build                                                              |
| **Presence**        | being somewhere with someone | already built here                                                                 |

## Presence as the scarce resource

Kindling already rations by physics. You cannot be in a room with a thousand
people a second. The optical stack — pay faces, `PXP1-P`, presence seals — was
built as a payment ritual, but it is also a **rate limiter with a physical
floor**, and that is a use no other chain has available to it.

Honest limit, unchanged: a presence seal proves two optical captures were
combined, not that two humans were present. It can be spoofed by one person with
two screens. So presence is a rate limiter, not a hard bound, and it would need
pairing with something — a cost, a witness set, reputation — to be load-bearing.

## A supply pegged to human presence

The proposal: tie supply to the global census and to the fact that a day holds
24 hours. If people are born there is more light to give; if people die, light
goes out. Scarcity comes from there not being many humans.

Three things about this are right, and two are arithmetic mistakes worth naming
before they get built.

### It is not unlimited supply

The instinctive objection to a population-linked supply is that it inflates
forever. It does not. Population is projected to peak near **10.3 billion around
2084** and decline after. A census peg therefore has a ceiling **26% above
today's level**, reached in about sixty years, followed by contraction.

For comparison, Bitcoin has roughly 5% of its supply left to issue. A census peg
is in the same order of magnitude of long-run discipline — and unlike 21,000,000,
it is a bound with a reason behind it.

Better, the implied monetary policy is one nobody had to choose:

| Demographic fact | Monetary effect              |
| ---------------- | ---------------------------- |
| 132M births/year | +1.61% new lighting capacity |
| 62M deaths/year  | −0.76% goes dark             |
| net today        | **+0.85%/year**              |
| after the peak   | deflationary, permanently    |

Sub-1% issuance drifting into deflation is a tighter policy than most central
banks target and most tokens achieve. It emerges from demography rather than from
a number someone picked.

### The census bound and the 24-hour bound are the same bound

Everyone alive lives exactly one year per year. So the flow of lived time per
year — person-years — **is** the population: 8.2 billion people produce 8.2
billion person-years annually, or 197 billion person-hours a day.

The two halves of the proposal are therefore not two constraints. "Everyone has
only 24 hours" measured as a stock is the census. That is a good sign: the idea is
coherent enough that its parts collapse into one quantity instead of fighting.

### Population times life expectancy double-counts

Multiplying the two is the one clear error. In a steady state, population _is_
annual births times average lifespan — 132M × 73 ≈ 9.6 billion, against an actual
8.2 billion, the gap being current growth. Lifespan is already inside the
population figure. Using both counts it twice.

Pick a stock (people alive) or a flow (births per year). Not their product.

### Death is not observable. Silence is.

A ledger can never learn that someone died. It cannot distinguish death from a
lost key, a flat battery, prison, or a decision to stop. Any rule phrased "when
people die" is unimplementable as literally stated.

This is a smaller problem than it looks, because the observable version is more
honest anyway: **light fades unless renewed.** A pixel going dark is already a
real state in this system rather than a metaphor — an unlit pixel needs no power
and holds its information. Absence of renewal is exactly what the chain can see.

### Why the literal peg cannot be built

The chain cannot know the world's population. Every figure is a UN estimate,
revised retroactively, with error bars in the tens of millions, produced by a
third party. Putting it into consensus means either trusting an oracle — which
contradicts the point of the whole system — or hardcoding a projection, which is
a fixed schedule wearing a lab coat.

So a census peg cannot be built by _reading_ the census.

### The version that can be built

It does not need to read the census, because a decaying supply measures the
population by itself.

Let light decay unless renewed, and let renewal require presence. Then in steady
state:

```
supply  =  people  ×  renewals per person per day  ×  half-life / ln 2
```

Supply is directly proportional to the number of people who keep showing up. No
oracle is consulted, and no projection is hardcoded. When people die or stop, the
renewals stop with them and their light fades on schedule — "the light goes out,"
implemented without ever claiming to observe a death.

The 24-hour fact becomes the cap on the middle term: no identity may renew more
than a day's worth per day. Bounded by humans and by hours, exactly as proposed.

The parameters set the unit's meaning. To make the standing supply equal roughly
one unit per living person:

| Half-life        | Renewal rate per person |
| ---------------- | ----------------------- |
| 1 year           | 1 per 527 days          |
| 5 years          | 1 per 2,633 days        |
| a lifetime (73y) | 1 per 38,441 days       |

### What it costs

This is **demurrage**, and it should be called that. It has a history — Gesell's
stamp scrip, Wörgl in 1932, Freicoin in 2013. It reliably does two things: it
discourages hoarding and encourages circulation, and it is unpopular with anyone
who wants a store of value, because a balance that decays is a balance that
punishes patience.

That trade is the actual decision. A supply that tracks living presence cannot
also be a thing you inherit unchanged. Choosing this means choosing memory of
presence over accumulation, deliberately, and saying so.

### Where it lives or dies

If issuance is gated on presence, then **manufacturing identities manufactures
money**. Everything above rests on presence being expensive to fake.

Kindling is this project's answer, and its honest limit is already recorded: a
presence seal proves two optical captures were combined, not that two humans were
present. One person with two screens defeats it. Until that gap closes, a
presence-pegged supply is a design resting on an unsolved problem — which is
worth stating plainly rather than discovering after issuance.

### Checking the arithmetic

```bash
bun run test:presence-peg
```

Every figure above is computed in `src/lib/pixel/presence-peg.ts` and asserted by
that selftest — including that doubling the people exactly doubles the supply,
that solving for one unit per living person inverts cleanly, and that the net
issuance turns negative once deaths outnumber births. It is a model only: no
consensus change, no schedule change, and the demographic inputs are deliberately
_not_ protocol constants, because a design that needs to read them needs an oracle.

## Why this is not decided here

Picking a reward number to keep existing tests passing would encode the mistake
rather than fix it. The candidate exact-and-flat schedules are:

| Reward | Horizon           | At 30s blocks |
| ------ | ----------------- | ------------- |
| 1 PIX  | 21,000,000 pixels | 20.0 years    |
| 3 PIX  | 7,000,000 pixels  | 6.7 years     |
| 21 PIX | 1,000,000 pixels  | 1.0 year      |
| 50 PIX | 420,000 pixels    | 146 days      |

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

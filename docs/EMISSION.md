# Emission — an open question, stated honestly

> **The ceiling is settled: 10,300,000,000 PIX, flat at 50 per pixel, horizon
> 206,000,000 pixels.** Confirmed 16 August 2026. `PIX_HARD_CAP` in
> `src/lib/pixel/economics.ts` is the source of truth and
> `scripts/claims-guard-selftest.ts` fails the build if any file states a schedule
> the code does not implement. Sections below marked superseded are kept because
> they record how the number was arrived at — read them as history, not as policy.
>
> **Superseded 13 August 2026** by [`GIFT-AND-RECORD.md`](./GIFT-AND-RECORD.md) —
> gifts are free and capped at one per pair, records cost three PIX from three
> distinct givers, light is spent into the picture rather than burned, and the
> witness recycles its share into onboarding. No bridge. This document records how
> the earlier conclusions were reached.

## The bug, which is settled

**Fixed, and the cap now means something.**

21,000,000 was Satoshi's number, borrowed for a ledger that is not money. The cap is
now **10,300,000,000 — one PIX for every human alive at the projected peak of
humanity**, around 2084, after which population declines. The schedule is flat at 50
PIX per pixel to a horizon of 206,000,000 pixels and mints exactly that. The old schedule could not even reach its own ceiling: halving was inherited from
Bitcoin without Bitcoin's base unit, so integer division truncated every era and the
series died 630,000 short.

The cap needs no oracle, which is what killed the census peg as a _rule_. A chain
cannot read the world's population — but a ceiling is a fixed number chosen once for
a stated reason, and this reason is legible to anyone who asks.

Flat is also the honest shape here. Halving front-loads a subsidy to buy mining
security; there is no hash race to subsidise, so the curve was paying for something
that does not exist. "Every moment is worth the same" is now true rather than
aspirational.

Nothing in existence is revalued: below pixel 210,000 the old and new schedules are
identical, both paying 50. `mintedThrough(29)` still returns 1,450, matching the
live chain.

Still open, and now the live question: **the reward goes to the sequencer.** With
five people the machine has earned 1,256 PIX while the humans hold under 200
between them. Sending it to the authors of the moments in each pixel — which
`lit-cell.ts` already identifies — would put issuance where the work is, and would
make supply track living participation without an oracle, which is where the census
idea landed.

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

### Decaying the earning rate instead of the stock

The obvious humane amendment: let already-minted light be permanent, so illness or
absence never erases a moment, and let only the _ability to mint_ lapse.

Worked out, it abandons the peg. If minted light is permanent, supply is cumulative
person-time — it rises linearly with time and never contracts, because deaths
remove nothing already issued:

| Horizon at a fixed population | Supply      |
| ----------------------------- | ----------- |
| 100 years                     | 2.99 × 10¹⁴ |
| 200 years                     | 5.99 × 10¹⁴ |

The population never changed, and supply doubled. "The light goes out" disappears
entirely — the one property that made the census idea worth having.

So the amendment is not free. One quantity cannot both track the living and
preserve the dead.

### Absence and fakery share one dial

Worse, the half-life cannot be tuned to be gentle on people and harsh on farms,
because decay cannot tell them apart. The rate at which it forgives an absent
person is exactly the rate at which it charges a farm to stand still:

| Half-life | 6 months absent | 1 year absent | Farm re-earns per year |
| --------- | --------------- | ------------- | ---------------------- |
| 1 year    | −29.29%         | −50.00%       | 50.00%                 |
| 5 years   | −6.70%          | −12.94%       | 12.94%                 |
| 20 years  | −1.72%          | −3.41%        | 3.41%                  |
| 73 years  | −0.47%          | −0.95%        | 0.95%                  |

Those last two columns are the same number, necessarily. Pick forgiveness and you
have picked cheapness for hoarded fakes.

Note the middle of that table is milder than the word "demurrage" suggests. At a
five-year half-life, half a year away costs 6.7% — comparable to a couple of years
of ordinary inflation, not confiscation.

### What decay does not do

An earlier framing of this — that decay turns Sybil from a one-time setup fee into
a subscription — overstates it, and the correction matters because it changes where
the defence has to come from.

Decay bounds how much a farm can _accumulate_. It does nothing to the
profitability of the marginal fake, which is set by reward against cost at any
half-life. If faking one presence earns more than it costs, farming pays.

|                          |                                      |
| ------------------------ | ------------------------------------ |
| $100 device over 3 years | **9.1¢ per identity-day**            |
| reward above that        | farming pays, at any farm size       |
| reward below that        | farming never pays, at any farm size |

The sign is independent of scale, so "they would need thousands of phones" is not
by itself a defence — thousands of phones is a purchase order, not a barrier.

This is where the 24-hour fact earns its place. It is not only a supply bound: it
is the cap that stops one device from serving many identities. Lift it and let a
device fake a hundred presences a day, and the cost per identity collapses from
9.1¢ to **0.09¢**, taking the whole security argument with it.

So the design constraint is concrete: **the value of a day's emission per identity
must sit below the daily cost of the cheapest device that can fake one.**

### The split that keeps both properties

The trap is treating record and money as one object. Only Bitcoin's design forces
that, where a UTXO is simultaneously the history and the cash.

Two quantities:

- **Moments** — witnessed presence. Cumulative, permanent, non-transferable. It
  grows forever, which is correct for a record and cheap to hold, since an unlit
  pixel needs no power to keep its information. This repo already derives them in
  `lit-cell.ts`.
- **PIX** — the fungible claim. Decays, tracks living presence, rations the right
  to write.

Both properties then hold at once, which the selftest asserts: halving the
population halves PIX, while the record of who was present is untouched by who is
still here.

What it buys is that absence costs **future income rather than memory**. Six months
in hospital costs some PIX and not one moment you were actually present for. What
it does not buy is exemption: the money side is still taxed at the rate that keeps
hoarded fakes expensive. The dial is shared. Only its blast radius shrinks.

### Retiring the half-life

Everything above about decay was solving a problem that death already solves.

When someone dies their keys go silent and their coins stop moving. The supply
goes dark on its own. The ledger simply never says so — Bitcoin's stated supply
counts millions of coins nobody can reach, and that number is a polite fiction
rather than a measurement.

Demurrage reports the same fact by destroying value. Measuring reports it for
free. So the honest form of "the light goes out" is a **statistic, not a rule**:

```bash
bun run test:lit-supply
```

An output's age is the time since it last moved, because spending an output
creates new ones. `litSupplyReport()` splits the supply into what is still moving
and what has gone quiet, in age bands that partition it exactly. Nothing is taxed,
no balance changes, and the same chain read two years later reports 0% lit with its
nominal supply untouched — the measurement is a view, not a mechanism.

That removes the whole absence/fakery dial. Nobody is punished for being away,
because nothing is taken from anyone.

**Honest limit:** unreachable and merely patient are indistinguishable. A
long-term holder reads as dark. This is a liveness statistic, not a claim about
who is alive.

Both readings are served over JSON-RPC, so a stranger can ask the public tip how
much of it has gone dark without running a node or taking our word for it:

| Method              | Params                   | Returns                                                                        |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `pix_getLitSupply`  | `[windowDays?]`          | nominal, lit and dark supply, plus age bands that partition the supply exactly |
| `pix_getBrightness` | `[address, windowDays?]` | what that address moved, not what it holds                                     |

```console
$ curl -s -X POST $TIP -d '{"jsonrpc":"2.0","id":1,"method":"pix_getLitSupply","params":[]}'
{"nominalSupply":50,"litSupply":50,"darkSupply":0,"windowDays":365,"litShare":1,"litAddresses":1,...}

$ curl -s -X POST $TIP -d '{"jsonrpc":"2.0","id":1,"method":"pix_getBrightness","params":["pix18d00…"]}'
{"address":"pix18d00…","moments":1,"movedAmount":50,"windowDays":30}
```

Both are reads with no consensus effect. Neither can alter a balance, which is
the entire distinction between measuring the dark and enforcing it.

### The Sybil problem was created by emission, not by presence

The earlier worry — that presence gating issuance means manufacturing identities
manufactures money — has emission as its load-bearing assumption.

A thousand phones producing transactions that nobody wanted is not farming. It is
paying fees to write noise into a record nobody reads. It only becomes farming if
the protocol pays more for a transaction than the transaction costs.

Which gives a single rule that removes the problem rather than defending against
it:

> **The protocol must never pay more for a transaction than the transaction costs.**

Under that rule the presence seal does not have to be unforgeable, because forging
it buys nothing. That matters, because the seal currently checks a self-declared
string field and cannot be made unforgeable in software anyway.

### Brightness is the honest reading

Real transactions are what a business wants regardless. A shop with a hundred
transactions a day lights a hundred moments, and burns brighter than a large
dormant balance — `addressBrightness()` counts what moved, not what is held.

This cannot be faked cheaply, and not because identity is verified. Every
transaction counted had to be paid for. Looking busy costs exactly what being busy
costs, which is the same reason proof of work is credible, without the electricity.

### Money and existence are the same object

The earlier proposal to split the record from the money is unnecessary, and the
reason is the lifecycle rather than the cryptography.

A coin is money while its owner can spend it, and a record once they cannot.
Nobody needs money when they are dead, and nobody needs to prove they exist every
day in monetary form. The role changes on its own, with no mechanism, no oracle,
and no decay — a UTXO is spendable value now and a monument afterwards. Bitcoin's
genesis 50 BTC is already exactly this: unspendable, and therefore purely a record.

So: **one object, two roles, and the transition is death.** That is what the
supply measurement above is reading when it separates lit from dark.

### What is left to decide

| Decided                  |                                                                       |
| ------------------------ | --------------------------------------------------------------------- |
| Record vs money          | one object; the role changes at death, no split needed                |
| Tracking living presence | measured (`litSupplyReport`), never enforced                          |
| Demurrage / half-life    | **rejected** — punishes absence to report what dormancy already shows |
| Sybil defence            | emission ≤ transaction cost, so forging presence buys nothing         |

| Still open            |                                                                                   |
| --------------------- | --------------------------------------------------------------------------------- |
| ~~Emission schedule~~ | **Resolved 16 Aug 2026** — 10,300,000,000 ceiling, flat 50/pixel, reached exactly |
| Initial distribution  | with emission capped at cost, how does a new person get their first PIX?          |

That second one is the live problem this analysis creates. Capping emission at the
cost of a transaction removes the farming incentive and, with it, the mechanism by
which anyone acquires PIX without buying it from someone who already has some.

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

## Why this was not decided here

<!-- superseded 2026-08-16: the ceiling question below was resolved. Kept as the
     record of how the shortlist was reasoned about, against the old 21,000,000
     target that has since been replaced. Do not read the table as current. -->

**Resolved 16 August 2026.** The ceiling is 10,300,000,000 and the reward is a flat
50 PIX per pixel, giving a horizon of 206,000,000 rewarded pixels. What follows is the
shortlist as it stood when the target was still Satoshi's number, kept so the
reasoning is auditable rather than asserted.

Picking a reward number to keep existing tests passing would encode the mistake
rather than fix it. The candidate exact-and-flat schedules were:

| Reward | Horizon           | At 30s blocks |
| ------ | ----------------- | ------------- |
| 1 PIX  | 21,000,000 pixels | 20.0 years    |
| 3 PIX  | 7,000,000 pixels  | 6.7 years     |
| 21 PIX | 1,000,000 pixels  | 1.0 year      |
| 50 PIX | 420,000 pixels    | 146 days      |

Each reached the then-target of 21,000,000 exactly, with no unreachable remainder and
no halving — so "every moment is worth the same" becomes true rather than
aspirational. That property is what survived into the decision; only the ceiling
changed.

<!-- /superseded -->

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

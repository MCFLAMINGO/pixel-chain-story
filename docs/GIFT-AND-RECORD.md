# Gift and record

The economics, as of 13 August 2026. Written down the night it was worked out.
Supersedes the earlier one-one-one sketch.

**Four of these rules are now code that refuses.** `src/lib/pixel/gift-and-record.ts`
enforces the gift cap, one-gift-per-pair, the three-distinct-giver quorum, and the
picture's share; `scripts/gift-and-record-selftest.ts` shows each one rejecting the
specific abuse it exists to stop, and shows that a bad moment cannot reach a block.
A rule described here and enforced nowhere is not a rule, so anything below that is
still only prose says so where it appears.

**The policy is off unless a network turns it on** (`PIXEL_GIFT_AND_RECORD=1`).
These are consensus rules, and changing validation underneath a running chain
orphans whoever upgrades last. The crowned Earth has real people on it, so enabling
this there is a ceremony rather than a deploy.

## Two acts, and only one is free

**A gift is free.** You give one PIX, one is minted back, you are made whole. The
receiver keeps it. Passing the peace costs the giver nothing, so there is never a
reason not to.

**The mint-back is not implemented, and must not be until the hole below is closed.**

A mint-back needs new PIX to appear outside the coinbase. Two routes exist and both
are shut: outputs exceeding inputs is refused by `applySpendTx`, and inflating the
coinbase is refused by `validateAndApplyBlockTxs`, which pins it to exactly
`lightReward(index) + fees`. Those are the PIX-02/03 conservation invariants from the
audit, and blocking this is them working.

**The hole: one gift per pair does not bound anything while addresses are free.**
A fresh address is always a new pair, so the pair limit cannot object to it. With the
mint-back, `alice → fresh puppet → alice` mints two PIX and leaves Alice one better
off at no cost, repeatable to the cap. Case 7 of `scripts/economy-model-selftest.ts`
runs it: **starting from zero PIX and 2000 free addresses, Alice ends with 2000 PIX
and writes 1000 records.**

So "supply is bounded by relationships" holds only if being given to by a distinct
party is costly. Today it is not, and nothing above prices address creation. The
bound is real against a fixed cast of givers and vacuous against an attacker who
mints the cast — which is the case that matters.

This is a design question, not a coding task: what makes a giver costly to
manufacture? Until it has an answer, the ceiling is enforced and the growth stays
switched off.

### Making a gift cost a phone does not fix it, and the reason is the pair rule

The obvious answer is physical presence: a fresh address is free, but a fresh address
that has _optically met_ another one needs a second handset in a second place. The
Kindling matrix already exists for exactly this exchange.

The cost is real. The **shape** of the cost is the problem, and one gift per ordered
pair is what gets it wrong. A per-pair budget grows as K² while devices cost K, so a
farm's cost per PIX falls as 1/K — the bigger the attacker, the cheaper each PIX.
`farmYield()` computes it and `test:presence-peg` checks it:

| Farm             | Capex | Cost per PIX | Share of the 10.3e9 cap |
| ---------------- | ----- | ------------ | ----------------------- |
| 100 handsets     | $20k  | $2.02        | ~0%                     |
| 100,000 handsets | $20M  | $0.002       | **97%**                 |

**$20 million of handsets commands enough fresh pairs to mint nearly every PIX that
will ever exist.** Sybil resistance that gets cheaper with scale is a volume discount.

### A per-identity budget is scale-invariant

Cap how many gifts an address may ever give — G, lifetime — and yield becomes K·G
against a cost of K. Cost per PIX is `phone/G`: **$4.00 at a hundred devices and
$4.00 at a hundred thousand.** The same $20M farm reaches 0.05% of the cap instead of
97%.

That is the property worth buying. Not that faking becomes impossible, but that it
stops getting cheaper the more of it you do. It also matches the design's own
arithmetic, which already assumes each person gives to about fifty others.

### One gift, one person: G = 1

The strongest version, and the one that makes the cap stop being an arbitrary number.

**Welcome each human once, and supply is exactly peak population — which is the cap.**
`PIX_HARD_CAP` and `WORLD_PEAK_POPULATION` are already the same value, so at G = 1 the
emission rule and the ceiling become one sentence instead of two facts that have to be
kept in agreement. There is no schedule left to get wrong.

The farm arithmetic is also the best available: a PIX costs a whole handset, $200, at
every scale. **A billion handsets — two hundred billion dollars — still reaches only
9.7% of the cap.**

Giving stays unlimited. What happens once is being _made whole_: your first gift is
minted back, every later gift is yours to pay for. So the social texture survives —
you can still welcome your wife, and Sammy, and a stadium — while the thing that
creates PIX happens once per person, which is what "one PIX per human" always meant.

### Both halves are needed, and G = 1 alone is worth nothing

The easy mistake is to take the budget as the fix. It is not. **Every fresh address
arrives with an unused budget of its own**, so 100,000 free addresses still mint
100,000 PIX at $0.00 each even at G = 1.

- A per-identity budget makes the yield **linear** in identities.
- A cost on identity makes linear yield **expensive**.

Neither works alone. The pair rule fails because K² pairs cost K devices; a budget on
free addresses fails because the budget is free too. Together they give the
scale-invariant $200/PIX above. That is why the presence work and the emission work
are the same problem, and why the mint-back cannot ship before presence does.

So the pair rule is necessary but not sufficient: it stops one relationship becoming
a faucet, and it does nothing about a thousand relationships being bought. **A
lifetime per-identity budget is the missing half.**

### How the farm is actually run

`farmYield()` prices a handset at $200 retail, which flatters the defence. No farm pays
that. Phone farms are an existing industry — click fraud, install fraud, review farming
— with known economics. For a million identities:

| Hardware                                | Capex | Cost per PIX |
| --------------------------------------- | ----- | ------------ |
| Retail handsets                         | $200M | $200.00      |
| Bulk used Android                       | $30M  | $30.00       |
| One screen, many cheap tablets watching | $8M   | $8.00        |
| Virtual camera fed a rendered frame     | $10k  | **$0.01**    |

**Emulation is 20,000× cheaper than the number the defence assumed.** If the check is
"a camera saw a pattern," software satisfies it at no marginal cost, and the whole
hardware argument collapses.

### And there is no forgery to detect

The case that defeats every integrity check: **a room of a thousand devices genuinely
_is_ present.** Nothing is faked. Every optical exchange is real. They all belong to one
person.

A presence proof proves presence, never personhood. So "detect the fake" is the wrong
frame — there is no fake to find. This is why device attestation, liveness checks and
better cameras do not answer it.

### What separates a farm from a village is topology

A farm is a clique whose edges all point inward. A village has edges into the rest of
the graph. **An edge to a stranger cannot be manufactured without the stranger**, and
strangers do not cooperate on request.

So the defence is not to verify the meeting but to require a **path into the existing
graph**: the mint needs a third party who was there and is not in the clique. Trust
flows outward from people already in the picture.

Two things follow, and the second is the one that matters:

**Rooting fixes the exponent.** With the budget rooted in the graph, a million devices
mint 10⁶ instead of 10¹² — linear, not quadratic. Necessary, and by itself worthless,
because a million emulated identities still cost $10k.

**The witness fixes the price.** Cost moves from hardware to _corrupting a witness_,
which is the one input a farm cannot cheapen by buying worse parts. And it is a dial:

| Witness regime                                | Cost per PIX |
| --------------------------------------------- | ------------ |
| Corrupt witness signs 100k welcomes unnoticed | $0.10        |
| 100 welcomes before detection, quorum of 3    | **$300.00**  |

Tightly dialled, that beats the best hardware assumption outright — $300 against $200 —
and unlike hardware it does not fall to cheaper parts. The dials are exactly two: what a
witness has to lose, and how fast a corrupt one is caught. Which is why rate limits per
witness and a graph anyone can read are load-bearing rather than hygiene.

### The farm cannot aggregate what it mints, and that is the real bound

Everything above is about the meeting. This is about everything after it, and it is
stronger than any of it — see `src/lib/pixel/farm-signature.ts`.

**Minting shape separates nothing.** Under a mint-once-per-identity budget, every
minting graph is a tree — farm and village alike, because each identity has exactly one
incoming mint. So there is no anomaly to find there.

**What separates them is the second meeting, and the flow afterwards.** A camera watching
a screen has no second meeting. And light spread over a million addresses is useless
until it is concentrated, which is a flow that all points one way:

| Measure                          | Consolidating farm | Real economy |
| -------------------------------- | ------------------ | ------------ |
| Reciprocity                      | 0.00               | 0.67         |
| Largest sink's share             | 1.00               | 0.11         |
| Person-to-person in-degree       | 100,000            | 6            |
| Addresses that only ever receive | 1.00               | 0.04         |

**The farm cannot buy its way out of this, and that is the point.** Reciprocity is light
sent back; consolidation is light kept. They are the same quantity pointing opposite
ways, so a farm returning a fraction `r` to look alive keeps exactly `1 − r`. At a real
economy's reciprocity of 0.67 it **keeps a third of what it minted**, and looking fully
alive keeps nothing.

That is why this beats detection. A detector can be evaded by a patient adversary; a
trade-off cannot, because it is arithmetic on the attacker's own balance and **the payoff
requires the very flow that exposes it.**

Cadence is a third, weaker signal. A script runs at a flat rate with no day or night —
0.000 burstiness, 4.2% in its peak hour, zero quiet hours. A concert is the opposite:
99.8% of its light inside one hour and 22 hours dark, one issuer to many and then many
turning to whoever is beside them.

### None of this may decide validity

The selftest keeps a false positive on purpose: **the largest sink in an honest economy
is the picture itself**, paid by everyone, with an in-degree of 500. A busy shop looks
the same. Any one of these measures read as a verdict would convict the one address the
design requires.

So these are read-only measurements for **witness eligibility** and for anyone auditing
the picture — never a validity rule. A heuristic in consensus would let a false positive
confiscate a real person's light.

### What this concedes

A bound, not immunity. And it admits that **trust has a root**: either humans who vouch
and can be de-elected, or the handset vendor. There is no third option in which identity
costs something and nobody is trusted at all.

Given the choice, humans are the answer consistent with everything else here — which
makes "who witnesses" not a loose end but the load-bearing question the emission design
rests on.

### Two things this rules out

**Proof of work per mint does not substitute.** Cloud silicon beats handsets on cost
per hash, so it prices out the very phone it was meant to privilege, and burning
energy to prove presence contradicts the reason this chain exists.

**Presence cannot be proven by the two parties alone.** They can always simulate the
optical channel between them by sharing the secret directly, so no seal the pair
produces is evidence against the pair. A real presence proof needs a third party who
was there — a witness — or hardware attestation, which installs the handset vendor as
trust root. `kindling.ts` is already honest about this: its seal is labelled
`simulated`, `partyId` is self-asserted, and the camera path is unshipped.

**A record costs three.** One is spent into the picture, one goes to the person you
are recording with, one goes to the witness who sealed it.

Generosity is free. Assertion is not. That split is what stops the record filling
with noise while leaving kindness unrationed — and it gives PIX a sink, which it
has never had.

## One gift per pair mints once — it does not forbid the second gift

The pair limit is a **minting** rule, not a validity rule. This is the correction that
matters most, because the first version had it as a refusal.

You can give your wife light every day of your life. What happens once is being _made
whole_: the first gift to a given person is minted back, and every gift after that is
one you pay for — you are simply down a PIX. Nothing is refused.

The refusal version was strictly worse, and obviously so once the mint-back is not yet
implemented: with no minting to bound, blocking a second gift bounded nothing at all
and only stopped people being generous. All of the cost, none of the benefit.

`giftMintsBack()` is the predicate. It is also where the shape rules belong — a gift
only has to be exactly one PIX to exactly one person _when it would mint_, since that
is the only moment the shape could create something. An oversized or batched gift is
not an error; it just moves light and mints nothing.

## A record needs three sources

The three PIX must come from **three different givers**. Not a fee — a quorum.

Faking it requires three wallets that already hold PIX, each of which needed a gift
from a distinct person, who needed theirs from someone else. The graph has to be
real all the way down, and free addresses do not manufacture provenance.

**It is verifiable from history.** The UTXO model already carries where each PIX
came from, so "three PIX from three distinct people" is a question the chain
answers by itself — no registry, no identity, no oracle.
`src/lib/pixel/provenance.ts` asks it; `scripts/provenance-selftest.ts` proves the
answer survives a restart and survives the gift being spent.

## Spent into the picture, not burned

The PIX a record consumes is not destroyed. It is placed. Paint is not lost when it
goes on the canvas.

Two readings then exist, both computable from history:

- **Light in circulation** — held by people, giftable
- **Light in the picture** — spent into moments, permanent, nobody's

The picture is an address derived from a phrase rather than from a key
(`PICTURE_PHRASE`), under its own preimage domain so no public key can reach it.
Anyone can recompute it and see it came from words. The balance there is the
accumulated cost of every record ever made — a number you can read, which a burn
would have made invisible.

Over time the second grows and the first turns over. That is what a record of
humanity should look like.

## Where the witness's share goes

Onboarding, and the loop closes.

Records pay the witness. The witness gifts newcomers their first light. Newcomers
participate, eventually record. Records pay the witness.

The faucet stops being a budget that runs dry and becomes **usage funding entry**.
And the one-gift-per-pair limit binds the witness too — it can welcome a million
people and cannot favour any of them twice.

**Open:** this is behaviour, not consensus. A witness could sit on its share. The
honest version makes it spendable only as first-gifts, the same standard applied to
the vault.

## Colour comes from the world, not from us

The current palette is authored — `spectrumToRgb` decides that the picture is
green. The data varies within it, but the hue family was chosen by code, and a
visitor in 2000 years would be reading someone's aesthetic as much as the ledger.

Two better sources, both readings rather than decisions:

- **A record of an image takes that image's colour.** Store three bytes of light and
  a hash of the original. The image lives wherever its owner keeps it; anyone
  holding it can verify the colour came from it; anyone without it still sees the
  light. Photograph a sunset, the pixel goes orange.
- **A gift takes its colour from the pair.** Derived from the two addresses, so the
  same two people always produce the same hue and relationships are visible as
  recurring colour.

Then the picture shows its own character: relationship-hues where people were
generous, content-hues where things were recorded.

The palette may widen across the 10.3 billion, so colouring itself has eras, and
which era a pixel belongs to is part of what a visitor decodes.

## Does the arithmetic close

| People      | Gifts each | PIX in existence |
| ----------- | ---------- | ---------------- |
| 5           | 4          | 20               |
| 1,000       | 20         | 20,000           |
| 1,000,000   | 30         | 30,000,000       |
| 200,000,000 | 50         | 10,000,000,000   |

**About 200 million people giving light to fifty others each fills the picture.**
The cap arrives through relationships rather than through time, and lands in the
right order for "humanity" without tuning.

A record removes 1 from circulation net (three spent, one back to the counterparty,
one to the witness who recycles it). Supply grows with meeting people and shrinks
with recording, balancing when the network keeps meeting as fast as it asserts.

For one person: given by 3 people is 1 record; by 10, three records; by 50, sixteen.
Then you replenish by **being someone else's counterparty**, which pays 1. You
cannot record much alone.

**Honest strain:** it is tight at small scale. Five people means twenty PIX in the
world and six possible records. The first serious commercial use hits the wall
immediately — that is information, not failure. And recording is deflationary, so a
network that only asserts and never meets drains into the picture until nobody can
afford to record.

## The math, checked

`bun run test:economy-model` holds the rules as code and attacks them, because prose
is where a zero-cost recycle nearly survived.

**Co-signing lowers the price, not the ceiling.** A record co-signed by its
counterparty costs two — one into the picture, one to whoever signed. An assertion
made alone costs three and pays nobody. Signature substitutes for quorum: if a real
second party puts their key on it, three strangers' light is not needed to establish
that you are not talking to yourself.

**The picture's share is load-bearing, and the test proves it both ways.** With it, a
colluding pair seeded with eight gifted PIX writes six records and then cannot
continue. Without it — a record that pays its co-signer and keeps nothing — the same
pair wrote 100,000 for free and was no poorer. That is the version that nearly got
written down.

**Writing is bounded by having been given to.** PIX enters only by gift, one per
ordered pair forever, so anyone's total output is capped by how many distinct people
ever vouched for them. Sockpuppets still have to pay, and can only pay with light
real people gave them.

Asserted over 400 random histories, checked after every step: supply conserved,
never above the cap, no negative balance.

**Open, and not settled by the model:** who pays. Designing from the mechanism
suggested the shop pays to record its sales, which is wrong — a shop got its money
and the transaction is over. Whoever wants the record pays, and that is usually the
customer, with the business earning by co-signing. The narrow case where a business
does want it is an unforgeable trading history where institutional trust is missing
or removable. If nobody wants a fact witnessed enough to spend on it, the thesis is
wrong and PIX has no demand — gifts are free, so they cannot create it.

## No bridge

The protocol never sells PIX. If someone needs light and has none, they find someone
who has it and make it worth their while — off-chain, in whatever people already
use. That is Bitcoin's first year, and it is most of why Satoshi was not the
operator of anything.

**Do not build the venue.** The moment dollars meet PIX in our code, we are running
it. Peer trade needs no code and makes us no party.

## Who witnesses

Earned by presence, constrained by capability, rotated by lottery.

Eligibility derived from the picture — who has been present, recently and
consistently — computed identically by everyone from the same chain. Not registered,
not voted, not granted.

Not everyone eligible can serve: a witness must keep a machine awake and reachable
when its turn comes, and a phone can hold the picture but never seal it. The real
set is the intersection, and it is self-selecting.

Rotation matters more now that the role pays. Turn-taking stops being fairness and
becomes the anti-capture mechanism.

**Blocked on:** sequencer membership living in the chain rather than in gossip
(`scripts/electable-drift-selftest.ts`).

## Prerequisites before any of this is built

1. **PIX divisibility.** Declared at 100,000,000 base units; the ledger counts whole
   PIX. The cap in base units exceeds JavaScript's safe integer range, so it needs
   `bigint`. Nothing here works in integers.
2. **A record-only moment.** Today every moment is a transfer and amounts must be
   positive, so "Harry met Sally" cannot be written without sending someone PIX.
3. **Sequencer membership in the chain**, before there can be more than one witness.

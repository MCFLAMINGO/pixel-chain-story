# Farming and the mint-back

The reasoning record for one decision: **the gift mint-back is not implemented, and must
not be until identity costs something.** Written 13 August 2026, in one long session, and
recorded here because the argument took several wrong turns that are more instructive than
the conclusion.

Everything below is computed rather than asserted. The tests are the argument:

| Claim                                  | Code                 | Test                   |
| -------------------------------------- | -------------------- | ---------------------- |
| The four gift/record rules refuse      | `gift-and-record.ts` | `test:gift-and-record` |
| Provenance is already in the UTXO set  | `provenance.ts`      | `test:provenance`      |
| The economy's invariants, and its hole | `economy-model.ts`   | `test:economy-model`   |
| Farm hardware and budget shape         | `presence-peg.ts`    | `test:presence-peg`    |
| A farm cannot aggregate and look alive | `farm-signature.ts`  | `test:farm-signature`  |
| What a farm actually harms             | `mint-harm.ts`       | `test:mint-harm`       |

---

## The decision

`GIFT-AND-RECORD.md` says a gift is free: you give one PIX, one is minted back, you are made
whole. **The limits on giving are enforced. The mint-back is not.** Under the policy a gift
currently costs the giver one PIX.

This is not an unfinished feature. Shipping it as written would be a minting vulnerability.

Two routes could express a mint-back and both are shut: outputs exceeding inputs is refused
by `applySpendTx`, and an inflated coinbase is refused by `validateAndApplyBlockTxs`, which
pins it to exactly `lightReward(index) + fees`. Those are the PIX-02/03 conservation
invariants from the audit. **Blocking this is them working**, not an obstacle to route
around.

---

## The hole

A fresh address is always a new pair, so a per-pair limit cannot object to one. With the
mint-back, giving costs the giver nothing. So `alice → fresh puppet → alice` mints two PIX
and leaves Alice one better off, at no cost, repeatable to the cap.

Case 7 of `test:economy-model` runs it: **from 0 PIX and 2000 free addresses, Alice ends
holding 2000 PIX and writes 1000 records.** Conservation passes the whole way — it is Sybil
resistance that fails, not the books.

It is pinned as a _passing_ test on purpose. Close the hole and case 7 fails loudly and must
be rewritten, which is when someone should be made to think.

The earlier Sybil tests missed it because they hold the cast of givers **fixed** and then
show output is bounded by it. True, and vacuous: neither lets the attacker mint the cast,
which is the case that matters.

---

## Budget shape: why per-pair is the wrong exponent

"Make giving cost a phone" is the right instinct. The **shape** of the cost decides whether
it helps, and one gift per ordered pair gets it wrong.

Pairs grow as K² while devices cost K, so cost per PIX falls as 1/K — the bigger the farm,
the cheaper each PIX. Sybil resistance that gets cheaper with scale is a volume discount:

| Farm             | Capex | Cost per PIX | Share of the cap |
| ---------------- | ----- | ------------ | ---------------- |
| 100 handsets     | $20k  | $2.02        | ~0%              |
| 100,000 handsets | $20M  | $0.002       | **97%**          |

A per-identity lifetime budget of G fixes it: yield is K·G against cost K, so cost per PIX
is `phone/G`, constant at every size.

### G = 1 — "one gift, one person"

The strongest version, and it makes the cap stop being arbitrary. `PIX_HARD_CAP` and
`WORLD_PEAK_POPULATION` are already the same number, so welcoming each human once makes the
emission rule and the ceiling **one sentence** rather than two facts kept in agreement. A
PIX costs a whole handset; a billion handsets reach 9.7% of the cap.

Giving stays unlimited. What happens once is being _made whole_.

### Both halves are required

**G = 1 alone is worth nothing.** Every fresh address arrives with an unused budget of its
own, so 100,000 free addresses still mint 100,000 PIX at $0.00 each.

- A per-identity budget makes yield **linear** in identities.
- A cost on identity makes linear yield **expensive**.

The pair rule fails because K² pairs cost K devices. A budget over free addresses fails
because the budget is free too. **Only together** do they give a scale-invariant price. This
is why the presence work and the emission work are one problem.

---

## How a farm is actually run

Retail pricing flatters the defence. Phone farms are an existing industry. For a million
identities:

| Hardware                                | Capex | Cost per PIX |
| --------------------------------------- | ----- | ------------ |
| Retail handsets                         | $200M | $200.00      |
| Bulk used Android                       | $30M  | $30.00       |
| One screen, many cheap tablets watching | $8M   | $8.00        |
| Virtual camera fed a rendered frame     | $10k  | **$0.01**    |

**Emulation is 20,000× cheaper than the number the hardware argument assumed.**

### There is no forgery to detect

**A room of a thousand devices genuinely _is_ present.** Nothing is faked, every optical
exchange is real, and they all belong to one person.

A presence proof proves presence, never personhood. So "detect the fake" is the wrong frame
— there is none. Device attestation, liveness checks and better cameras all answer a
question nobody asked.

### Presence cannot be proven by the two parties alone

They can always simulate the optical channel by sharing the secret directly, so no seal a
pair produces is evidence against that pair. A real presence proof needs a third party who
was there, or hardware attestation with the vendor as trust root.

`kindling.ts` is already honest about this: the seal is labelled `simulated`, `partyId` is
self-asserted, and the camera path is unshipped.

### Proof of work does not substitute

Cloud silicon beats handsets on cost per hash, so it prices out the very phone it was meant
to privilege — and burning energy to prove presence contradicts the reason this chain exists.

---

## What separates a farm from a village is topology

A farm is a clique whose edges point inward. A village has edges into the rest of the graph,
and **an edge to a stranger cannot be manufactured without the stranger.**

So require a _path into the existing graph_ rather than merely a meeting. Cost moves from
hardware to **corrupting a witness**, the one input a farm cannot cheapen by buying worse
parts:

| Witness regime                                | Cost per PIX |
| --------------------------------------------- | ------------ |
| Corrupt witness signs 100k welcomes unnoticed | $0.10        |
| 100 welcomes before detection, quorum of 3    | **$300.00**  |

Two dials only: what a witness has to lose, and how fast a corrupt one is caught. Which makes
rate limits per witness and a publicly readable graph load-bearing rather than hygiene.

### Minting shape separates nothing

Under a mint-once budget every minting graph is a **tree** — farm and village alike, since
each identity has one incoming mint. There is no anomaly to find there. What separates them
is the second meeting, and the flow afterwards.

### The farm cannot aggregate and look alive

The strongest result, because it is not a heuristic.

| Measure                          | Consolidating farm | Real economy |
| -------------------------------- | ------------------ | ------------ |
| Reciprocity                      | 0.00               | 0.67         |
| Largest sink's share             | 1.00               | 0.11         |
| Person-to-person in-degree       | 100,000            | 6            |
| Addresses that only ever receive | 1.00               | 0.04         |

Reciprocity is light sent back; consolidation is light kept. **The same quantity pointing
opposite ways**, so a farm returning a fraction `r` to look alive keeps exactly `1 − r`. At
a real economy's 0.67 it keeps a third; looking fully alive keeps nothing.

A detector can be evaded by a patient adversary. **A trade-off cannot**, because it is
arithmetic on the attacker's own balance and the payoff requires the very flow that exposes
it. You can hide the minting; you cannot hide the spending, because the spending is the point.

Cadence is a weaker third signal. A script runs flat — 0.000 burstiness, 4.2% in its peak
hour, zero quiet hours. A concert puts 99.8% of its light in one hour and leaves 22 dark.

### None of it may decide validity

The test keeps a false positive on purpose: **the largest sink in an honest economy is the
picture itself**, paid by everyone, in-degree 500. A busy shop looks identical. Any one
measure read as a verdict would convict the one address the design requires.

These are read-only measurements for **witness eligibility** and for auditing the picture.
A heuristic in consensus would let a false positive confiscate a real person's light.

---

## Three things I got wrong

The most useful part of the record. Each was stated confidently and each sent the design
toward a defence it did not need.

### 1. The pair limit as a refusal

It was implemented as "a second gift to the same person is invalid." Backwards. With no
mint-back, refusing bounded nothing — there was no minting to bound — and only stopped
people being generous.

**The pair limit is a minting rule, not a validity rule.** A gift is always allowed; you are
made whole the first time and pay for every one after. It also follows that the shape rules
(one PIX, one recipient) only apply _when a gift would mint_, so oversized and batched gifts
are not errors — they move light and mint nothing.

### 2. "Farming excludes people"

I claimed cap consumed by a farm was cap unavailable to humans not yet born; that one farmed
PIX was one person who could never be welcomed. **Wrong.**

**A person can always be given light**, and whether it is newly minted is irrelevant to them.
The cap gates _minting_, never _welcoming_. An exhausted cap ends the subsidy that made
giving free — after which welcoming costs the giver one PIX, which is how every gift after
the first already works.

Found while checking this: **the cap could never have subsidised everyone.** At 132M births a
year, 10.3e9 is **78 years** of free welcomes with zero farming, because `PIX_HARD_CAP` is
peak _simultaneous_ population while welcomes accumulate across generations. About 117
billion humans have ever lived — eleven times the cap. It is a subsidy with a horizon, not a
seat per person. Fine once named; not fine while being described as one PIX per human forever.

So the honest unit of harm is years of subsidy: 1% of the cap farmed burns about nine months
of free welcoming, with no victim.

### 3. "Farming captures the right to write"

The replacement claim, also overstated. **A stock of light is not a share of the record** —
the picture is made of what was _spent_, not what is _held_.

| Farm holding 1% of the cap              |           |
| --------------------------------------- | --------- |
| Share of holdings, idle                 | 99%       |
| Share of the picture, idle              | **0%**    |
| Records it can buy before going broke   | 51.5M     |
| PIX handed to honest witnesses doing so | **51.5M** |

Hoarding writes nothing, and to control a static picture is to control nothing — the same
reason a captured network is a worthless one. If holding Bitcoin were attainable only by the
state, Bitcoin would be pointless. Whoever captures a network of participation destroys the
thing they captured.

And writing liquidates the hoard while funding the network it meant to capture: a record
loses one PIX to the picture and one to a witness outside the farm. Capture is finite,
self-terminating, and ends broke.

---

## What survives: why farming is still worth making hard

Three corrections are not an argument that farming is harmless.

**The on-ramp dies for the poorest.** Burning the subsidy ends free welcoming, so somebody
whose only contacts also hold nothing cannot get in. The subsidy is precisely what serves
people with no light yet. **This is the harm that survives everything, and it is not about
supply at all.**

**It is cheap undefended.** About **$103M** burns the whole 78-year subsidy at emulated
prices — one rich enemy, not a nation-state programme. Witness-attested it costs **$3.1tn**.
That gap is the entire case for the presence work.

**The burst it buys is permanent.** Records spend into the picture and the picture never
forgets, so farmed records cannot be cleaned out. Bounded, but not reversible.

---

## Open, in priority order

1. **Who witnesses.** Not a loose end — the load-bearing question. Presence cannot be proven
   by the pair, so someone outside it must attest, and the whole price depends on witnesses
   having something to lose and being caught quickly. `GIFT-AND-RECORD.md` parks this under
   "who witnesses"; it should be promoted.
2. **A per-identity mint budget**, rooted in the existing graph, replacing the per-pair
   budget. Linear instead of quadratic. Necessary, insufficient alone.
3. **Whether the cap should be fixed at all.** Two findings now point the same way: the
   78-year subsidy horizon, and a terminus of exactly one record per person after which
   the picture can never change. `presence-peg.ts` already models `population-pegged` and
   `cumulative` regimes.
4. **The mint-back itself**, last, and only after 1 and 2. It needs the coinbase equality
   check taught to permit exactly one kind of non-coinbase mint under exactly these
   conditions, with its own adversarial tests.

## The end

Two clocks, and the one everybody watches is the wrong one.

**The subsidy clock** ends at 78 years, when the cap is minted out. The network survives it:
welcoming still works, it just costs the giver a PIX.

**The writing clock** is the terminus. Every record buries one PIX in the picture
permanently, and gifts move light without consuming it. So the number of records the picture
can ever hold is fixed by the cap — and because the cap was set to peak population:

    10.3e9 PIX / 1 PIX per record = 10.3e9 records = exactly 1.00 per peak-human

**Nobody chose that.** It falls out of two decisions made for unrelated reasons, and it is
the tightest number in the design. One record each, and then the light is all in the
picture: permanent, nobody's, unspendable, and nothing further can ever be written.

That may be the intended shape — a complete and unalterable record, nearer a cave painting
than a currency. But it is not what "one PIX per human forever" describes, and it should be
deliberate rather than incidental.

### The perverse part

A co-signed record requires _holding_ two PIX, so whether the last light is usable depends on
how it is spread — and the answer runs against everything else here:

| Distribution             | Light stranded, unusable |
| ------------------------ | ------------------------ |
| Spread evenly            | **33.3%**                |
| Pooled into 1% of people | 0.33%                    |

Spread evenly, everyone ends holding one PIX, nobody can reach two, and a third of all light
is permanently unreachable. **The fair distribution is the wasteful one.** The terminal phase
pays a premium for concentration.

Both of these argue for supply that renews with presence rather than draining once.
`presence-peg.ts` already models those regimes.

## A note on method

Every wrong claim above survived because it sounded right and nothing computed it. Each died
within minutes of being turned into arithmetic — `farmYield`, `consolidationPrice`,
`subsidyHarm`, `captureIsSelfLiquidating`. **The model is not documentation of the design;
it is the thing that catches the design being wrong.** Case 7 exists because the model was
written before the consensus code, and it is the reason a minting hole was found in a
whiteboard rather than in a chain with people's money on it.

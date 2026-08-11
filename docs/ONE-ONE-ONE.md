# One-one-one

The emission design, decided 11 August 2026. **Not yet implemented** — this is the
specification, written down before it evaporated. Consensus changes follow.

## The rule

A pixel mints **three PIX**: one to the giver, one to the receiver, one to the
witness who sealed it.

Giving costs you nothing. You send a PIX to someone and are made whole, they are
better off, and the moment is recorded. That is the passing of the peace: you turn
to your neighbour, and neither of you is poorer for it.

Three roles, one act, and the act does not exist if any is missing. A transaction
with no counterparty is a self-deal. One with no witness is unrecorded.

## Why per pixel and not per moment

Per moment is a printing press. Send to fifty of your own addresses and mint fifty
— and no rule can stop it, because addresses are free and wallets are deliberately
unlinkable. Every fix that asks _who are you_ is answered by becoming someone else.

Fixed per pixel removes the question. Stuffing more moments into a pixel splits the
same three PIX further; it does not create more. The mint rate is bounded by the
pixel rate, which is the property that protects Bitcoin, without the electricity.

## The numbers

|                       |                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------- |
| Cap                   | **10,300,000,000 PIX** — one per human alive at the projected peak of humanity (~2084) |
| Big Bang              | first **500 pixels at 50 PIX** = 25,000 PIX                                            |
| Then                  | **3 PIX per pixel**, split one-one-one                                                 |
| Pixels after the bang | 3,433,325,000                                                                          |
| Total pixels          | **3,433,325,500**                                                                      |
| Time to complete      | ~1,100 years at 10s/pixel; ~3,300 at 30s                                               |

The arithmetic closes exactly: 25,000 + (3,433,325,000 × 3) = 10,300,000,000.

The cap needs no oracle, which is what killed the census as a _rule_ in
[`EMISSION.md`](./EMISSION.md). A chain cannot read the world's population. But a
ceiling is a number chosen once for a stated reason, and this reason is legible to
anyone who asks — which 21,000,000 never was.

The picture is not a census of people. It is a count of **times someone turned to a
neighbour**. A census records that you were alive; this records that you
acknowledged someone else.

## The Big Bang

The first 500 pixels keep the inherited 50. Not because 50 means anything — it was
Satoshi's number and nothing here justifies it — but because rewriting what is
already minted is the one thing this project exists to make impossible.

So it stands as a bright, brief beginning, and the record says plainly that the
first 500 pixels were minted under an inherited schedule. Small, permanent, honest.

At the time of writing the chain is at pixel 46. The bang is nearly over.

## The jubilee

The witness accumulates. That is the flaw that made the sequencer the richest party
in the church while the congregation held almost nothing.

Leviticus 25: every fiftieth year, what accumulated returns to the people. So 50
survives — not as the reward, but as the cycle. **When the flock reaches its number,
the witness's held share returns to those present.**

Two requirements, and the first is what makes it real:

- **Automatic.** A rule in consensus that releases the accumulation when the
  condition is met, with no signature involved. Not the operator choosing to give
  back — that is a treasury with good intentions, which is what every foundation
  says about its treasury.
- **Chain-derived.** The condition is computable from history alone.
  `litSupplyReport()` already counts distinct participating addresses.

In the trinity the spirit is not a shareholder. The theology and the ledger agree
here: the witness must not hold property.

## Two things still open

**The flock's number.** Twelve is the candidate — already in play as the diversity
threshold, and 3(3)+1 = 10 means twelve tolerates three faults with margin where
seven tolerates two with none. 120 has a case too: the number in the upper room at
Pentecost, the point at which a group becomes a church.

**Per head or per participation.** Equal shares are theologically right and
economically farmable — twelve free addresses call the jubilee down on themselves.
Shares proportional to moments survive free addresses, and there is a reading where
that is also right: the peace passes between people who actually turned to each
other, not to everyone standing in the room.

## What this is not

Not a Ponzi, and the guard is structural rather than stated. The protocol never pays
more for a moment than the moment costs, so there is no yield to sell. Nothing
promises appreciation. And after the bang the witness accumulates three PIX per
pixel instead of fifty, so the pre-mine that makes such schemes possible largely
fails to form.

The remaining exposure is the vault being spendable by a key at all. Until it is
claimable only by rule, "owned by humanity" is a sentence and a private key is the
fact.

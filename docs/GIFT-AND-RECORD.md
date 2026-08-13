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

**A record costs three.** One is spent into the picture, one goes to the person you
are recording with, one goes to the witness who sealed it.

Generosity is free. Assertion is not. That split is what stops the record filling
with noise while leaving kindness unrationed — and it gives PIX a sink, which it
has never had.

## One gift per pair, ever

The rule that makes any of it work.

Without it, giving being free means PIX is free: a holder could gift the same
person every pixel, forever, and nothing is scarce. With it, a person can be given
light **once** by each other person. To hold three PIX you must be known to three
people.

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

# Leader unpredictability — a design, not a change

**Status: design only. Nothing here is implemented.** Every option below is a hard fork and
belongs on a fresh devnet network id before it goes anywhere near 20553. This document exists so
the decision can be made deliberately rather than discovered halfway through an implementation.

## The problem

```ts
function lotteryScore(prevHash, sequence, address) {
  return sha512SyncHex(`pols-lottery|${prevHash}|${sequence}|${address}`);
}
```

Every input is public. `prevHash` is the tip everyone has, `sequence` is `tip.sequence + 1`, and
the electable set is a fold over committed records. So **anybody can compute who produces the
next pixel, and the one after that, and the one after that** — as far ahead as they care to look,
the moment a pixel lands.

[`SPEC.md`](./SPEC.md) has always said this: _"Public-input verifiable; **not** VRF/BFT."_ It was
honest and it was fine, because with one sequencer there was nothing to predict. That changed on
17 August when a second operator became possible.

### What it costs, concretely

**Targeted denial of service.** Knowing the next producer's address does not immediately give you
its IP, but operators are not anonymous in practice — they advertise a gossip host so peers can
dial them ([`OPERATOR.md`](./OPERATOR.md) Tier 2 requires it). Knock the next producer offline for
`POLS_STALL_MS` and the slot goes to a skip. Do it every slot and one operator can be excluded
from producing entirely while looking, from the outside, merely unreliable.

**Selective censorship with plausible deniability.** A producer who knows its slot is coming can
decide in advance not to include a particular transaction, and a producer who knows it is _not_
coming can be pressured about the slot of whoever is. With a predictable schedule, "who can
censor this transaction, and when" is public information.

**Grinding, if anything else ever becomes grindable.** T1.2 bound `sequence` to `tip.sequence + 1`
and T1.1 made the electable set a fold, so the current inputs are all fixed. But `prevHash`
depends on the block a producer builds, so a producer at height H has _some_ influence over who
is elected at H+1 — it can try transaction orderings and pick the one whose resulting hash favours
a preferred successor. With two operators and no fee market that is nearly worthless. It stops
being worthless as the set grows and there is something to gain.

### What it does not cost

Nothing about this lets anyone produce a pixel they are not entitled to. That was the T1.1
takeover and it is closed. This is about _predictability of a legitimate schedule_, not about
forging authority — a much smaller problem, and one worth keeping in proportion.

---

## Option A — a hash-based VRF over a per-height seed

Replace the public score with something only the elected producer can compute in advance, and
everyone can verify afterwards.

```
score = H(vrf_output(sk_i, seed_H))     where seed_H is unpredictable at H-1
```

The candidate learns its own score; nobody else learns anyone's until the proof is published with
the block.

### The problem with this project specifically

There is no post-quantum VRF worth shipping. Classical VRFs are built on elliptic curves —
exactly what [`QUANTUM.md`](./QUANTUM.md) puts out of scope, and adopting one would mean the
sentence "classical ECC is not used" stops being true for the most security-critical part of
consensus.

The PQ-friendly constructions that exist are hash-based, and the honest ones are large:

| Construction                 | Verifiable | PQ     | Cost                                        |
| ---------------------------- | ---------- | ------ | ------------------------------------------- |
| ECVRF (RFC 9381)             | yes        | **no** | small, and out of scope here                |
| hash-based VRF via OTS       | yes        | yes    | one one-time key per height, forever        |
| VRF from a SNARK over a hash | yes        | yes    | a proving system this project does not have |

The hash-based OTS route deserves a moment because it is tempting and it is a trap. Pixel already
has `PIX-HASH-OTS-128` with a Merkle window of 32 leaves and a consensus-enforced reuse ledger. A
producer could commit to a Merkle root and reveal one leaf per height as its VRF output. It works,
and it means **every operator needs a fresh window every 32 pixels, forever**, with a key rotation
ceremony to match. That is a permanent operational tax on the thing this project is currently
short of: operators willing to run a node.

**Verdict: not now.** Revisit if a PQ VRF becomes standard, or if the operator set is large enough
that key rotation is somebody's job rather than an obstacle to recruitment.

---

## Option B — commit-reveal beacon from the previous k producers

Each producer commits to a random value in its block and reveals it k blocks later. The seed for
height H is the fold of the reveals landing at H.

```
pixel H:      carries commit_H = H(r_H)
pixel H+k:    carries reveal r_H
seed_{H+k} = H(r_{H-k+1} ‖ … ‖ r_H)
lotteryScore(seed, address)  instead of  lotteryScore(prevHash, sequence, address)
```

Nobody can compute the seed for H+k until every reveal is in, so the schedule is unpredictable
more than k pixels out while remaining fully verifiable afterwards: a commitment that does not
match its reveal is a rule violation anyone can check.

### Why this fits better

- **No new cryptography.** SHA-512 and the existing signature schemes. Nothing to argue about
  quantum-wise, and nothing new to get subtly wrong.
- **No key rotation.** No per-height keys, no windows, no ceremony. Operators do nothing
  different.
- **It reuses machinery that exists.** `LedgerPixel` already carries producer-chosen
  consensus-bound fields (`field`, `wave`, `membership`) that `acceptBlock` recomputes or
  validates. Two more — `beaconCommit` and `beaconReveal` — is the same pattern, and T1.9 already
  established that anything a block carries must be checked.

### The honest weaknesses

**Last-revealer bias.** The final producer to reveal sees every other reveal and can compute the
resulting seed before deciding whether to publish. Withholding is one bit of influence per slot,
and with a small set that bit is not negligible. Mitigations, in order of honesty:

- Treat a missing reveal as a **slashable or ejectable** offence. There is no stake to slash, but
  membership is now a fold over records — a `sequencer-leave` for a persistent non-revealer is
  expressible today and would need a rule for authorising it without a human.
- Fold reveals from **k distinct producers** so one withholder cannot alone determine the outcome.
  Bias falls as the set grows, which is the same direction the project needs to move anyway.
- **Bound the gain**: with n operators the best a withholder can do is choose between two seeds,
  so its advantage is at most one extra slot in expectation. That is a real number, statable in
  the spec, and much better than "unknown".

**Bootstrap.** The first k pixels have no reveals to fold. The seed must fall back to `prevHash`
for those, which means the first k pixels of any chain are exactly as predictable as today. Fine,
and it must be written down rather than discovered.

**A stalled chain leaks its future.** If no pixel is produced for a while, the pending reveals do
not change and the schedule becomes computable again. Predictability degrades gracefully to
today's behaviour, which is the correct failure direction, but it does mean the property is
weakest exactly when the chain is least healthy.

---

## Option C — do nothing, and say so

Worth stating as a real option rather than a straw man.

With two operators, the practical benefit of unpredictability is small and the cost of a hard fork
is not. The current honest claim — _"public-input verifiable, not a VRF"_ — is already in the spec
and already correct. Nothing here is a soundness problem; T1.1 and T1.2 closed those. This is a
robustness problem that scales with the operator count.

**Do nothing until there are enough operators that a targeted DoS is worth mounting**, and spend
the intervening effort on the things that are unambiguously blocking: a third operator, both anchor
venues reachable so finality can be switched on, and an external audit.

---

## Recommendation

**Option C now, Option B when the operator set reaches roughly five.**

The reasoning: unpredictability protects against an attacker who can knock a specific operator
offline. With two operators, losing either one already degrades to a single-writer chain, so an
attacker who can do that does not need to know the schedule — the schedule is not the weak link.
Around five, excluding one operator stops being fatal and starts being _profitable_, and that is
when predictability becomes the thing worth fixing.

Option A stays parked unless a post-quantum VRF becomes standard. Its cost is not the mathematics,
it is the permanent key-rotation tax on operators, and operators are the scarce resource.

### If Option B is chosen, the order of work

1. `docs/SPEC.md` first — the seed derivation, the commit/reveal binding, the bootstrap fallback,
   and the stated bias bound. A consensus change that starts as code is a consensus change nobody
   reviewed.
2. Frozen vectors for the new preimages, in the same commit as the code. `test:protocol-vectors`
   will refuse anything else, which is exactly what it is for.
3. A fresh devnet network id. Not 20553, and not a flag on 20553 either — this changes the PoLS
   message, so it is a genuine fork rather than a policy switch like
   [`FINALITY.md`](./FINALITY.md).
4. `test:two-operator` and `test:operator-handshake` re-run against the devnet id, plus a new test
   for the case that will actually break: a producer that commits and never reveals.

## See also

- [`SPEC.md`](./SPEC.md) §4 — the current lottery, and its stated limits
- [`QUANTUM.md`](./QUANTUM.md) — why an ECVRF is not available here
- [`FINALITY.md`](./FINALITY.md) — the other Phase 3 rule, and why _that_ one could ship flag-gated
- [`STATE-2026-08-17.md`](./STATE-2026-08-17.md) — "the leader is predictable" on the
  still-not-true list

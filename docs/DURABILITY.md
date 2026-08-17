# Durability — what survives when humans and hosts do not

This file is the honesty map for “the relic exists beyond human death.” It is normative
for **claims**, not for consensus rules. Consensus stays in [`SPEC.md`](./SPEC.md).
Operator steps stay in [`OPERATOR.md`](./OPERATOR.md).

Bitcoin’s durability is: many independent machines voluntarily enforce the same rules;
GitHub, cloud bills, and company accounts are tools for humans, not part of the system’s
existence. Pixel wants that shape. **Pixel does not have it yet.** Saying otherwise fails
the build (`test:claims-guard` durability section).

---

## Readable vs extendable

| Goal | Meaning | Status (2026-08-17) |
| --- | --- | --- |
| **Readable forever** | Anyone can verify the picture from a copy, offline if needed | **Yellow** — `verify:crowned` + fixtures work; copies are still too few |
| **Extendable forever** | New pixels keep appearing with no designated living authorizer | **Red** — sequencing is invitation-only today; hybrid bond door is designed, not shipped |

Do not collapse these into one slogan. A chain that stops growing but still verifies is a
relic people can still read. A chain that grows only while one Railway account is paid is
not Bitcoin-class survival.

---

## Grades against Bitcoin’s properties

| Property | Grade | Pixel today |
| --- | --- | --- |
| Shared rules, locally enforced | **Green** | `acceptBlock` / `verifyChain` / `verify:crowned` |
| Cryptographic self-custody for people | **Green** | `/wallet` PIN seal; no server holds seeds |
| Open source / no phone-home to GitHub | **Green** | Clone and run; node software does not phone home |
| Frozen vectors / second-implementation path | **Yellow** | Vectors exist; second client does not |
| Permissionless **verification** | **Yellow** | `verify:crowned` + ceremony pack; discovery uses mirrors but only one live host listed |
| Many independent full copies | **Yellow** | Backup + `test:tip-failover` prove restore; still need a second human holding a copy |
| Tip discovery without one magic host | **Yellow** | `tip-mirrors.json` + `join --mirrors` / `--public-tip`; add more live mirrors to leave Yellow |
| Permissionless **sequencing** | **Red** | Membership needs an active member’s authorization |
| Economic recruitment of strangers | **Red** | Coinbase exists; strangers cannot claim seats |
| Hosting independence (GitHub/Railway = convenience) | **Red** | Tip liveness is a cloud bill today |
| Finality without maintained cron | **Red** | Anchors help; finality flag off; venues are testnets |

Honest public sentence until the red rows move:

> Executable post-quantum UTXO lab with independent verification, invitation-based
> sequencing, and a live tip. Not a permissionless network; not host-independent.

---

## Forbidden claims (until evidence moves the grade)

Do **not** say, in docs or product copy, without an explicit “aspiration / not shipped”
marker that the claims guard recognizes:

- “decentralized network” / “fully decentralized” (about Pixel itself)
- “permissionless mining” / “anyone can sequence”
- “no single point of failure”
- “Bitcoin-class” durability / survival / decentralization
- “runs without anyone” / “runs forever without operators”
- “host-independent” as a present-tense fact

Allowed:

- Naming **Bitcoin** or **Ethereum** as decentralized / permissionless (other systems).
- Venue rows in [`ANCHORING.md`](./ANCHORING.md) that label *those* chains’ sequencers.
- Aspiration blocks marked `<!-- durability-aspiration -->` … `<!-- /durability-aspiration -->`
  or a line that begins with `Aspiration —` in this file and STATE notes.
- “Permissionless **verification**” when describing `verify:crowned` / Tier 1 — that path
  is real; do not stretch it to sequencing.

---

## Hybrid design (locked 2026-08-17 — not shipped)

Erik’s decisions, recorded so code does not invent a different story:

1. **Always-on sequencers remain required for liveness.** Phones do not replace them.
2. **Phones** are light verifiers + optional PIX bond holders (`/wallet`). Most people
   bond; few **carry** (opt into the reachable producer set).
3. **Two doors into the producer set (when D3 ships):**
   - **Invitation** (today’s T1.1) while the set is healthy.
   - **PIX bond** so the set cannot go extinct when the last human disappears.
4. **Rejected doors:** Proof-of-work admission (recreates Bitcoin vs AI compute auction);
   Light-Credits-gated seats (conflates builder fuel with security).
5. **Quantum:** bonding does not weaken ML-DSA / hash-OTS. Bonds and tips stay on PQ
   schemes. Classical bridge risk stays bridge risk; it is not a sequencer committee.

Threat model and parameters (K, T, bond floor, active-set derivation) land in this file
before any electable-path code ships. Until then, invitation-only remains the rule on
network 20553.

---

## What closes each red row

| Gap | Closes with |
| --- | --- |
| One copy | Tier 1 holders + tip mirrors + failover test ([`OPERATOR.md`](./OPERATOR.md)) |
| One magic URL | `tip-mirrors.json` + `join --mirrors` |
| Invitation-only extinction | D3 hybrid bond door (design → vectors → fresh network id) |
| Hosting dependence | Tip-as-cattle runbook; non-GitHub mirrors |
| One implementation | Second client verifying vectors + crowned fixture |

---

## D3 threat model (hybrid bond — design lock, not shipped)

Before any electable-path code lands on a fresh network id:

| Attack | Defence |
| --- | --- |
| August grind-keypair takeover | Bond floor + activation delay; invitation path unchanged while set ≥ K |
| Extinction when last inviter dies | Bond door opens after electable count < K for time T |
| AI / energy auction (Bitcoin problem) | No PoW admission; lottery stays trivial hash; seats never sold for Light Credits |
| Millions of sleeping phones stall the tip | Active producer set = bonded/invited operators who opted to **carry** (reachable); `POLS_MAX_SKIP` stays a liveness bound |
| Light-only majority misses a bad UTXO fold | Keep Tier 1 full copies + `people:verify` / `verify:crowned`; bond does not replace full verifiers |
| Quantum forge of bond / tip signatures | Unchanged — ML-DSA / hash-OTS only; no classical sequencer committee |
| Cheap Sybil bonds | Bond paid in PIX; parameters (floor, K, T) are monetary decisions recorded here before code |

Parameters **not** set yet (must be before vectors): bond floor, K, T, carry heartbeat, slash rules (slash may ship later than bond).

---

## Related

- [`OPERATOR.md`](./OPERATOR.md) — Tier 1 copy, Tier 2 gossip, Tier 3 invite
- [`CANONICAL-TIP.md`](./CANONICAL-TIP.md) — how the tip is hosted today (honest ops)
- [`STATE-2026-08-17.md`](./STATE-2026-08-17.md) — soundness session that made hybrid possible
- [`QUANTUM.md`](./QUANTUM.md) — PQ posture (unchanged by bonding)
- [`PHONE-WALLET.md`](./PHONE-WALLET.md) — phone is pay face, not `pixel init`
- People verify: `bun run people:verify` (offline) · `bun run people:verify -- --live`

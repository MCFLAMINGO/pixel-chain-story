# Path to a respected L1 / bridge / sovereignty regime

**Stance:** keep the honest lab frame _and_ build until the frame is obsolete.  
Respect is not requested in copy. It is earned when a skeptical engineer can clone, break, and still find the invariants holding.

This document is the north star. [`ROADMAP.md`](./ROADMAP.md) is the checklist. Normative behavior is whatever [`SPEC.md`](./SPEC.md) + CI enforce.

---

## 0. How respect is earned (non-negotiable)

| Skeptic move          | Our answer                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| “Cute metaphor”       | Point at `bun run test:all` + SPEC invariants                                                              |
| “Vapor bridge”        | Point at a **non-stub** foreign verifier + frozen fixture                                                  |
| “Not an L1”           | Point at multi-host tip extension, stall recovery, headers sync                                            |
| “Sovereignty theater” | Point at ≥7 live diverse providers failing cloud-majority sets _on the wire_                               |
| “QR marketing”        | Point at OTS leaf enforcement + live `PIX-ML-DSA-65` (`bun run test:mldsa`) + [`QUANTUM.md`](./QUANTUM.md) |
| “Optical scam”        | Point at real camera capture + two-device Kindling that fails remote                                       |

**Public voice rule:** claim only what the highest passing gate allows. Vocabulary (Kindling, Worldlight, PoLS) stays — claims escalate with gates.

**Guide:** art guided by science it need not name (`One.Creed.guide`). Light verbs compress the physics of being; they do not excuse missing invariants.

**Never:** hide gaps behind thesis strings. Thesis strings describe intent; gates prove delivery.

---

## 1. Where we are (Gates A–C, E, F lab)

Runnable, tested, and framed as a **lab prototype with real crypto**:

- UTXO ledger + PoLS sequential tip + multi-process accept + stall skip (Gate C)
- Merkle-window PIX-HASH-OTS-128 (one-time leaves; weak verifier fail-closed)
- One API, SISO model, Access invite-only, Kindling _simulated_ channel
- Worldlight + lock feeder (local USDC rail / wire attestor)
- **ULAVerifier** keccak-OTS twin (`IS_STUB=false`) + CosmWasm twin + custody inversion (Gate E)
- Headers-first sync, balance merkle proofs, signed hello scoring, `docs/BENCH.md` (Gate F lab)
- OTS leaf single-use at consensus + electable-bound lottery + 4-node lab mesh
- Diversity *policy* code; enforced when ≥7 providers registered
- CI: crypto + protocol selftests + Foundry + lint + build

**Allowed claim:** *“Executable post-quantum-class UTXO lab; multi-host tip extension; ULA verify + phone-capable light path (lab).”*  
**Forbidden claim:** *“Production L1 / production bridge / AWS-proof network / BFT mainnet.”*

---

## 2. The regime we are building (destination)

| Pillar                 | Done means                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **L1**                 | Independent hosts extend one tip; stalled sequencers recoverable; light clients sync headers; published benches     |
| **Bridge**             | Lock on A → verify on B with **real** crypto; no stub `lightProofValid`; testnet value moved end-to-end             |
| **Sovereignty**        | Live ≥7-provider set; diversity enforced on join; no required CDN/API hostname for ledger use                       |
| **Custody / Kindling** | Personal Source + two-device optical (or proven proximity) path; SMS still never spends                             |
| **Crypto**             | **Critical.** Versioned schemes; ML-DSA-65 shipped; production default ML-DSA; OTS retained for constrained devices |

Invention stays ([`INVENT.md`](./INVENT.md)). Uptake bridges stay optional.

---

## 3. Gates (build in order — skip = lose respect)

Each gate has **evidence** (repo artifact) and **claim unlock**. Do not advertise the next claim early.

### Gate B — Network that doesn’t flake

**Build**

- [x] Two-machine (or two-VPS) `init` / `node` / `join` demo — [`docs/demos/two-node.md`](./demos/two-node.md) + `bun run test:net`
- [x] Persistent peer book; reconnect with backoff; `get_pixels` / `pixels` hole-fill + `/sync` join
- [x] Tip stall **detection** (warn + catch-up). Skip/replace = Gate C (shipped)
- [x] OTS single-use at ledger + lab leader lottery with electable bound in light proof
- [x] 4-node lab mesh — `bun run test:four-node` + [`docs/DEVNET.md`](./DEVNET.md)

**Evidence:** `docs/demos/two-node.md` + `bun run test:net` + `test:four-node`  
**Claim unlock:** _“Multi-host Pixel network (prototype tip extension).”_ — not fault-tolerant consensus yet.

### Gate C — Consensus that survives fault

**Build**

- [x] Explicit fork-choice / tip rules in SPEC (§4.1 — prefer lower skip, depth-1 replace)
- [x] Sequencer timeout + skip replacement (`skipCount` in light proof; `bun run test:fault`)
- [x] Reorg depth policy depth 1 (`replaceTipIfBetter`)

**Evidence:** SPEC §4.1 + `bun run test:fault`  
**Claim unlock:** _“Fault-tolerant PoLS (lab).”_ Still not “BFT mainnet.”

### Gate D — Quantum security (critical priority — parallel with B)

**Build**

- [x] `signPixel` / `verifyPixel` scheme surface
- [x] **PIX-ML-DSA-65** (NIST FIPS-204 via `@noble/post-quantum`) on tx + PoLS
- [x] PIX-HASH-OTS-128 retained (one-time leaves)
- [x] Freeze public test vectors file in CI (`src/lib/pixel/vectors/quantum-v1.json` + `test:vectors`)
- [x] Wallet/node persist `scheme` + ML-DSA secret / OTS `nextLeaf`
- [x] Default `PIXEL_SIG_SCHEME` / `DEFAULT_SCHEME=PIX-ML-DSA-65` for new genesis

**Evidence:** `bun run test:mldsa` + `bun run test:vectors` green; [`QUANTUM.md`](./QUANTUM.md)  
**Claim unlock:** *“Crypto-agile PQ signatures — ML-DSA-65 default birth, hash-OTS retained.”*

### Gate E — Bridge that verifies

**Build**

- [x] Replace `ULAVerifier` stub with real verify of frozen ULA fixture (`PIX-HASH-OTS-128-KECCAK`)
- [x] Foundry tests + CosmWasm twin (`contracts/cosmwasm/ula-verifier`)
- [x] Relayer: anvil `PixelUsdcLock` `Locked` → `LockFeeder.feed` → shineIn (`bun run test:ula-relayer`)
- [x] Custody inversion law: foreign = receipt, Pixel = vault (`BRIDGE_CUSTODY_AXIOM`, `test:bridge-custody`)
- [ ] Public testnet tx links (Sepolia or equiv.) — still open

**Evidence:** green Foundry + [`docs/BRIDGE-STATUS.md`](./BRIDGE-STATUS.md) (public tx links pending)  
**Claim unlock (partial):** _“ULA verify real on EVM/CosmWasm twins (lab); local lock→shineIn; foreign verify ≠ vault release.”_ Full _“Testnet ULA bridge”_ when public links land.

### Gate F — Light clients & gossip that scale past 3 peers

**Build**
- [x] Headers-first sync (`/sync/headers`, `get_headers` / `headers`, `verifyHeaderChain`)
- [x] Merkle proofs for balances (`proveBalance` / `verifyBalanceProof`, `pix_getBalanceProof`)
- [x] Peer keys + basic scoring / eclipse guard (signed hello + `peer-score.ts`)
- [x] Bench harness → [`docs/BENCH.md`](./BENCH.md) via `bun run test:bench`

**Evidence:** `bun run test:light` + `docs/BENCH.md` from `test:bench`  
**Claim unlock:** *“Phone-capable light client path (lab).”* — stateRoot at tip today; per-pixel historical state commits still open.

### Gate G — Sovereignty as protocol law on a live set

**Build**

- Provider registry on-wire (not only RPC echo)
- `join` / sequencer admission calls `assertSovereignIfLive`
- Public status page or RPC: live diversity report from real peers
- ≥7 independent operators (home/colo/minority-cloud mix) — even if friends/pilots

**Evidence:** live report snapshot + policy rejection demo (cloud-majority join fails)  
**Claim unlock:** _“Diversity-enforced sequencer set (pilot network).”_

### Gate H — Kindling / optical that is not theater

**Build**

- [x] `getUserMedia` + canvas sample (`optical-capture.ts`)
- [x] Raster round-trip CI (`bun run test:optical`)
- [x] Kindling seals with `channel: "optical-capture"` when physical captures provided
- [ ] Two-phone field notes (aim at projector → sample)
- [ ] Personal Source unlock persists leaf cursor / scheme safely after optical unlock

**Evidence:** `test:optical` + kindling optical-capture path green  
**Claim unlock:** _“Optical capture path shipped (pilot); presence-bound Kindling when channel=optical-capture.”_

### Gate I — External scrutiny

**Build**

- Threat model v1 frozen; scope for audit (crypto + acceptPixel + ULA)
- Fix criticals; publish report link

**Evidence:** `docs/AUDIT.md`  
**Claim unlock:** _“Audited components (scoped).”_ Full “trusted L1” only after broader ops maturity.

### Gate J — Regime (public network)

**Build**

- Named public network id; genesis ceremony notes; multiple subnets or checkpointing
- SISO mirror mesh actually used when an origin dies (chaos drill)
- No required Cloudflare/API for ledger use (explorer may use CDN)

**Evidence:** public peers, chaos drill writeup, sovereignty report continuous  
**Claim unlock:** _“Pixel public pilot / mainnet-candidate.”_

---

## 4. Workstreams (parallel after Gate B)

| Stream                | Owner shape   | Depends on                                |
| --------------------- | ------------- | ----------------------------------------- |
| **Node / consensus**  | Systems       | B → C → F                                 |
| **Crypto**            | Cryptography  | D (can start now)                         |
| **Bridge / Solidity** | Eth + relayer | E (can start stub→real now)               |
| **Sovereignty ops**   | Operators     | G (needs B+)                              |
| **Kindling / mobile** | Client        | H (needs D for safe keys)                 |
| **Field access**      | BD/KS pilots  | Access + Kindling invite; never blocks L1 |

Coders pick a stream via [`CONTRIBUTING.md`](./CONTRIBUTING.md). Non-coders: field pilots and provider ops still move Gate G/H.

---

## 5. Communication doctrine (so “non-coder toy” never sticks)

1. **Lead with the runnable artifact** — CLI, tests, SPEC — then name the invention.
2. **Gate badges** in README / `pix_protocolInfo.status` — e.g. `gates: ["A","B"]`.
3. **Compare carefully** — Bitcoin scarcity math and Ethereum sequencer analogies are fine; “we replace X” is not, until the gate for X is green.
4. **Keep metaphors subordinate** — Lumen/Kindling explain UX; they do not excuse missing fork-choice.
5. **Invite hostile review** — link THREAT-MODEL gaps; reward people who find landmines (we already closed `verifyLight`).

---

## 6. Immediate next actions (this repo)

1. Gate E deepen: Foundry ULA verifying **ML-DSA** (keccak-OTS twin already ships)
2. Continuity agentic deploy jobs + public mirror pilots
3. Lumen depth + SISO chaos drill on real hosts
4. Keep `pix_protocolInfo` gates honest as evidence lands

Gate D (ML-DSA default + frozen vectors) is in. The skeptic meets NIST PQ birth, networked tip, and a verifying bridge twin — still a pilot, but not a costume.

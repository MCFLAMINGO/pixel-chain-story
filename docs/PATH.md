# Path to a respected L1 / bridge / sovereignty regime

**Stance:** keep the honest lab frame *and* build until the frame is obsolete.  
Respect is not requested in copy. It is earned when a skeptical engineer can clone, break, and still find the invariants holding.

This document is the north star. [`ROADMAP.md`](./ROADMAP.md) is the checklist. Normative behavior is whatever [`SPEC.md`](./SPEC.md) + CI enforce.

---

## 0. How respect is earned (non-negotiable)

| Skeptic move | Our answer |
| --- | --- |
| “Cute metaphor” | Point at `bun run test:all` + SPEC invariants |
| “Vapor bridge” | Point at a **non-stub** foreign verifier + frozen fixture |
| “Not an L1” | Point at multi-host tip extension, stall recovery, headers sync |
| “Sovereignty theater” | Point at ≥7 live diverse providers failing cloud-majority sets *on the wire* |
| “QR marketing” | Point at OTS leaf enforcement + live `PIX-ML-DSA-65` (`bun run test:mldsa`) + [`QUANTUM.md`](./QUANTUM.md) |
| “Optical scam” | Point at real camera capture + two-device Kindling that fails remote |

**Public voice rule:** claim only what the highest passing gate allows. Vocabulary (Kindling, Worldlight, PoLS) stays — claims escalate with gates.

**Never:** hide gaps behind thesis strings. Thesis strings describe intent; gates prove delivery.

---

## 1. Where we are (Gate A — shipped)

Runnable, tested, and framed as a **lab prototype with real crypto**:

- UTXO ledger + PoLS sequential tip + multi-process accept
- Merkle-window PIX-HASH-OTS-128 (one-time leaves; weak verifier fail-closed)
- One API, SISO model, Access invite-only, Kindling *simulated* channel
- Worldlight + lock feeder (local USDC rail / wire attestor)
- Diversity *policy* code; enforced when ≥7 providers registered
- CI: crypto + protocol selftests + lint + build

**Allowed claim:** *“Executable post-quantum-class UTXO lab with a clear upgrade path.”*  
**Forbidden claim:** *“Production L1 / production bridge / AWS-proof network.”*

---

## 2. The regime we are building (destination)

| Pillar | Done means |
| --- | --- |
| **L1** | Independent hosts extend one tip; stalled sequencers recoverable; light clients sync headers; published benches |
| **Bridge** | Lock on A → verify on B with **real** crypto; no stub `lightProofValid`; testnet value moved end-to-end |
| **Sovereignty** | Live ≥7-provider set; diversity enforced on join; no required CDN/API hostname for ledger use |
| **Custody / Kindling** | Personal Source + two-device optical (or proven proximity) path; SMS still never spends |
| **Crypto** | **Critical.** Versioned schemes; ML-DSA-65 shipped; production default ML-DSA; OTS retained for constrained devices |

Invention stays ([`INVENT.md`](./INVENT.md)). Uptake bridges stay optional.

---

## 3. Gates (build in order — skip = lose respect)

Each gate has **evidence** (repo artifact) and **claim unlock**. Do not advertise the next claim early.

### Gate B — Network that doesn’t flake
**Build**
- Two-machine (or two-VPS) `init` / `node` / `join` demo script in CI or documented with recorded logs
- Persistent peer book; reconnect; `get_pixels` catch-up that fills holes
- Tip stall detection: elected sequencer silent → skip/view-change proposal (even if simple timeout vote)

**Evidence:** `docs/demos/two-node.md` + passing networked selftest or published log bundle  
**Claim unlock:** *“Multi-host Pixel network (prototype consensus).”*

### Gate C — Consensus that survives fault
**Build**
- Explicit fork-choice / tip rules in SPEC (not only `index === tip+1`)
- Sequencer timeout + replacement without manual reset
- Reorg depth policy (even if depth 1–2 at first) with tests

**Evidence:** SPEC §PoLS fault section + tests for offline sequencer  
**Claim unlock:** *“Fault-tolerant PoLS (lab).”* Still not “BFT mainnet.”

### Gate D — Quantum security (critical priority — parallel with B)
**Build**
- [x] `signPixel` / `verifyPixel` scheme surface
- [x] **PIX-ML-DSA-65** (NIST FIPS-204 via `@noble/post-quantum`) on tx + PoLS
- [x] PIX-HASH-OTS-128 retained (one-time leaves)
- [ ] Freeze public test vectors file in CI
- [ ] Wallet/node persist `scheme` + ML-DSA secret / OTS `nextLeaf`
- [ ] Optional: default `PIXEL_SIG_SCHEME=PIX-ML-DSA-65` for new genesis

**Evidence:** `bun run test:mldsa` green; [`QUANTUM.md`](./QUANTUM.md)  
**Claim unlock:** *“Crypto-agile PQ signatures (hash-OTS + NIST ML-DSA-65).”* — partial unlock now for in-process ML-DSA.

### Gate E — Bridge that verifies
**Build**
- Replace `ULAVerifier` stub with real verify of frozen ULA fixture (hash-OTS or ML-DSA)
- Foundry (or Hardhat) tests; one second chain (CosmWasm *or* Move) twin
- Relayer: watch `PixelUsdcLock` testnet `Locked` → `LockFeeder.feed` → shineIn

**Evidence:** green Foundry suite + one public testnet tx links in `docs/BRIDGE-STATUS.md`  
**Claim unlock:** *“Testnet Universal Light Attestation bridge.”*

### Gate F — Light clients & gossip that scale past 3 peers
**Build**
- Headers-first sync; merkle proofs for balances
- Peer keys + basic scoring / eclipse resistance
- Bench harness: published tx/s and verify latency for N txs/pixel

**Evidence:** `docs/BENCH.md` regenerated in CI artifact  
**Claim unlock:** *“Phone-capable light client path.”*

### Gate G — Sovereignty as protocol law on a live set
**Build**
- Provider registry on-wire (not only RPC echo)
- `join` / sequencer admission calls `assertSovereignIfLive`
- Public status page or RPC: live diversity report from real peers
- ≥7 independent operators (home/colo/minority-cloud mix) — even if friends/pilots

**Evidence:** live report snapshot + policy rejection demo (cloud-majority join fails)  
**Claim unlock:** *“Diversity-enforced sequencer set (pilot network).”*

### Gate H — Kindling / optical that is not theater
**Build**
- [x] `getUserMedia` + canvas sample (`optical-capture.ts`)
- [x] Raster round-trip CI (`bun run test:optical`)
- [x] Kindling seals with `channel: "optical-capture"` when physical captures provided
- [ ] Two-phone field notes (aim at projector → sample)
- [ ] Personal Source unlock persists leaf cursor / scheme safely after optical unlock

**Evidence:** `test:optical` + kindling optical-capture path green  
**Claim unlock:** *“Optical capture path shipped (pilot); presence-bound Kindling when channel=optical-capture.”*

### Gate I — External scrutiny
**Build**
- Threat model v1 frozen; scope for audit (crypto + acceptPixel + ULA)
- Fix criticals; publish report link

**Evidence:** `docs/AUDIT.md`  
**Claim unlock:** *“Audited components (scoped).”* Full “trusted L1” only after broader ops maturity.

### Gate J — Regime (public network)
**Build**
- Named public network id; genesis ceremony notes; multiple subnets or checkpointing
- SISO mirror mesh actually used when an origin dies (chaos drill)
- No required Cloudflare/API for ledger use (explorer may use CDN)

**Evidence:** public peers, chaos drill writeup, sovereignty report continuous  
**Claim unlock:** *“Pixel public pilot / mainnet-candidate.”*

---

## 4. Workstreams (parallel after Gate B)

| Stream | Owner shape | Depends on |
| --- | --- | --- |
| **Node / consensus** | Systems | B → C → F |
| **Crypto** | Cryptography | D (can start now) |
| **Bridge / Solidity** | Eth + relayer | E (can start stub→real now) |
| **Sovereignty ops** | Operators | G (needs B+) |
| **Kindling / mobile** | Client | H (needs D for safe keys) |
| **Field access** | BD/KS pilots | Access + Kindling invite; never blocks L1 |

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

1. **Gate D (quantum, critical):** freeze ML-DSA vectors; persist `scheme` in nodekey/wallets; document `PIXEL_SIG_SCHEME`  
2. Gate B: flake-free two-node demo + stall detection design note  
3. Gate E: Foundry ULA verifying **PQ** sigs (OTS or ML-DSA), not stub length checks  
4. Keep `pix_protocolInfo.quantum` honest as gaps close  

When Gate B + D + E are green, the skeptic meets a networked tip, NIST PQ signatures, and a verifying bridge — still a pilot, but not a costume.

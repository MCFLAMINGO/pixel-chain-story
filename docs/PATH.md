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
| “QR marketing” | Point at OTS leaf enforcement + ML-DSA vectors in CI |
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
| **Crypto** | Versioned schemes; ML-DSA (or SLH-DSA) production default; OTS retained for constrained devices |

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

### Gate D — Crypto adults in the room
**Build**
- `SignatureScheme` interface; PIX-HASH-OTS retained; **ML-DSA** (or liboqs) behind same tx/PoLS verify
- Fixed test vectors in CI; domain-separated messages
- Wallet persists scheme id + OTS `nextLeaf` / ML-DSA key

**Evidence:** `scripts/crypto-vectors-selftest.ts` green; SPEC crypto table updated  
**Claim unlock:** *“Crypto-agile PQ signatures (OTS + ML-DSA).”*

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
- `getUserMedia` (or native) capture path; seals with `channel: "optical-capture"`
- Two-device flow that fails when both halves are scripted in one process without capture evidence
- Personal Source unlock persists leaf cursor / scheme safely

**Evidence:** device test notes + selftest with mocked MediaStream fixtures  
**Claim unlock:** *“Presence-bound spend authorization (pilot).”*

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

1. Gate B: flake-free two-node demo + stall detection design note  
2. Gate D: sketch `SignatureScheme` + first ML-DSA vector harness (even if behind flag)  
3. Gate E: Foundry project; turn `ULAVerifier` toward real verify of one frozen fixture  
4. Expose `gates` on `pix_protocolInfo` so the UI can’t overclaim past CI  

When Gate B–E are green, the “cute idea” attack dies on contact: the skeptic has a network, PQ-agile sigs, and a verifying bridge — still a pilot, but no longer a costume.

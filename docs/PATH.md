# Path to a respected L1 / bridge / sovereignty regime

> **Start here:** [`STATE-2026-08-13.md`](./STATE-2026-08-13.md) — current state ·
> durability grades: [`DURABILITY.md`](./DURABILITY.md)
> settled decisions, open questions, and the order things must be built in. The
> gates below predate several of those decisions and still measure this project
> against Ethereum's shape, which it is not.
>
> **For the emission and Sybil question**, which blocks the economics:
> [`FARMING-AND-THE-MINT-BACK.md`](./FARMING-AND-THE-MINT-BACK.md) — why the gift
> mint-back is not implemented, the arithmetic behind every claim, and three
> confident conclusions that turned out to be wrong.

**Stance:** keep the honest lab frame _and_ build until the frame is obsolete.  
Respect is not requested in copy. It is earned when a skeptical engineer can clone, break, and still find the invariants holding.

This document is the north star checklist of **earned respect**. [`ROADMAP.md`](./ROADMAP.md) is the gate list. Normative behavior is whatever [`SPEC.md`](./SPEC.md) + CI enforce.

**Dream (destination voice):** build Pixel into a world-class model for a future species — light signatures in a dark universe; **one public canvas** people join with a wallet; every real act a **mark on the tip**. Think big; solve big problems; build until the lab frame is obsolete. See [`WORLD-CANVAS.md`](./WORLD-CANVAS.md).

**Claim (public voice):** only what the highest passing gate allows. Dream ≠ claim. See [`DOORS.md`](./DOORS.md). Local `init` is builder scaffolding — not the people product.

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
- Diversity _policy_ code; enforced when ≥7 providers registered
- CI: crypto + protocol selftests + Foundry + lint + build

**Allowed claim:** _“Executable post-quantum-class UTXO lab; multi-host tip extension; ULA verify + phone-capable light path (lab).”_  
**Forbidden claim:** _“Production L1 / production bridge / AWS-proof network / BFT mainnet.”_

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
**Claim unlock:** _“Crypto-agile PQ signatures — ML-DSA-65 default birth, hash-OTS retained.”_

### Gate E — Bridge that verifies

**Build**

- [x] Replace `ULAVerifier` stub with real verify of frozen ULA fixture (`PIX-HASH-OTS-256-KECCAK`)
- [x] Foundry tests + CosmWasm twin (`contracts/cosmwasm/ula-verifier`)
- [x] Relayer: anvil `PixelUsdcLock` `Locked` → `LockFeeder.feed` → shineIn (`bun run test:ula-relayer`)
- [x] Custody inversion law: foreign = receipt, Pixel = vault (`BRIDGE_CUSTODY_AXIOM`, `test:bridge-custody`)
- [x] Native ULAs under ML-DSA sequencers + keccak-OTS twin projection (`test:ula-mldsa`)
- [x] Lab off-chain ML-DSA commit gate (`ULAOffchainMldsaGate.sol`) — **not** full on-chain Dilithium
- [x] Tip `POST /bridge/shine-in-lock` + phone Bridge UI (anvil evidence `test:sepolia-bridge`); lab shine-in stays behind `PIXEL_BRIDGE_LAB`
- [x] Public Sepolia deploy + first lock → tip PIX — [`BRIDGE-STATUS.md`](./BRIDGE-STATUS.md) (lock [`0xa1c12522…`](https://sepolia.etherscan.io/tx/0xa1c12522d6cd051ec09cff0ff7e22e17a24ff453b1aa7e5bb9ed3980abfea8df) → tip **#7**)
- [ ] Full on-chain ML-DSA verify (zk/precompile research) — open

**Evidence:** green Foundry + [`docs/BRIDGE-STATUS.md`](./BRIDGE-STATUS.md) + [`docs/ULA-MLDSA.md`](./ULA-MLDSA.md) (Sepolia public lock landed)  
**Claim unlock (partial):** _“ULA verify real on EVM/CosmWasm twins (lab); native ML-DSA ULAs; PQ commit gate; Sepolia MockUSDC lock→tip PIX (public); foreign verify ≠ vault release.”_ Do **not** claim mainnet USDC or “on-chain Dilithium.”

### Gate F — Light clients & gossip that scale past 3 peers

**Build**

- [x] Headers-first sync (`/sync/headers`, `get_headers` / `headers`, `verifyHeaderChain`)
- [x] Merkle proofs for balances (`proveBalance` / `verifyBalanceProof`, `pix_getBalanceProof`)
- [x] Peer keys + basic scoring / eclipse guard (signed hello + `peer-score.ts`)
- [x] Bench harness → [`docs/BENCH.md`](./BENCH.md) via `bun run test:bench`

**Evidence:** `bun run test:light` + `docs/BENCH.md` from `test:bench`  
**Claim unlock:** _“Phone-capable light client path (lab).”_ — stateRoot at tip today; per-pixel historical state commits still open.

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
- [x] Phone `/wallet` pay-face Kindling matrix (Show face / Scan matrix) — address rail; vault never projected (`test:pay-face-optical`)
- [ ] Tip `settleKindling` over RPC (offer/accept Presence Seal on public tip) — open
- [ ] Two-phone field notes (aim at projector → sample)
- [x] Personal Source unlock persists leaf cursor safely after optical unlock (`people-wallet` `nextLeaf` + `restoreLightKeypair`)
- [ ] Scheme id persisted beside vault for ML-DSA Personal Sources (OTS path green)

**Evidence:** `test:optical` + kindling optical-capture path green + `test:pay-face-optical`

**Claim unlock:** _“Optical capture path shipped (pilot); presence-bound Kindling when channel=optical-capture.”_

### Gate I — External scrutiny

**Build**

- [x] Threat model **v1.1** frozen; scope for audit (crypto + `acceptBlock` + ULA) — [`THREAT-MODEL.md`](./THREAT-MODEL.md)
- [x] Audit package + self-review checklist — [`AUDIT.md`](./AUDIT.md) status **PREPARING**
- [x] `bun run test:audit-scope` invariants
- [x] Pre-audit pass: 22 findings from [`audit/EXTERNAL-AUDIT-GATE-I.json`](./audit/EXTERNAL-AUDIT-GATE-I.json) fixed, each with a regression test that fails on the pre-fix commit
- [x] Adversarial + invariant suites gate CI (`test:adversarial`, `test:invariants`) — green CI now means invalid operations fail, not just that valid ones succeed
- [ ] External firm engaged; criticals fixed; report link published

**Evidence:** [`docs/AUDIT.md`](./AUDIT.md) (PREPARING until report link) + `bun run test:adversarial` + `bun run test:invariants`  
**Claim unlock (now):** _“Scoped audit package prepared; external review pending.”_  
**Claim unlock (after report + fixes):** _“Audited components (scoped).”_ Full “trusted L1” only after broader ops maturity.

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

### Forbidden claim — RWA continuity

A post-quantum attestation of an ECDSA-secured position does **not** make that
position quantum-safe. Never claim "quantum-safe RWA", "PQ-protected holdings",
or that ML-DSA secures assets held on a foreign chain. The honest claim is
provenance that outlives the venue — see [`RWA-CONTINUITY.md`](./RWA-CONTINUITY.md).

## 5. Communication doctrine (so “non-coder toy” never sticks)

1. **Lead with the runnable artifact** — CLI, tests, SPEC — then name the invention.
2. **Gate badges** in README / `pix_protocolInfo.status` — e.g. `gates: ["A","B"]`.
3. **Compare carefully** — Bitcoin scarcity math and Ethereum sequencer analogies are fine; “we replace X” is not, until the gate for X is green.
4. **Keep metaphors subordinate** — Lumen/Kindling explain UX; they do not excuse missing fork-choice.
5. **Invite hostile review** — link THREAT-MODEL gaps; reward people who find landmines (we already closed `verifyLight`).

---

## 6. Immediate next actions (this repo)

0. [x] **Namespace the network id so a genesis cannot be forged onto the crowned Earth.**
       Done: `createGenesis` defaults to `PIXEL_LAB_NETWORK_ID` (0x504c) and the crowned
       id 0x5049 is enforced against `CROWNED_GENESIS_HASH` at node startup. Deleting the
       forge path outright is still open; `PIXEL_GENESIS_CEREMONY=1` remains the gate.

   Original plan:

   **Namespace the network id so a genesis cannot be forged onto the crowned Earth.**
   Bitcoin has no ceremony script: the genesis is a constant in the client and any
   chain not starting there is rejected. `PIXEL_GENESIS_CEREMONY=1` (`tip:host`) is
   the weak version of that — it stops an accident, it does not make one impossible.

   The real fix, in order:
   - Give lab / selftest / demo chains their own network id. `createGenesis`
     currently defaults everything to 20553, which is why `canvas-id.ts` has to warn
     that a matching family id is not the same picture.
   - Then make network 20553 accept exactly one genesis — `CROWNED_GENESIS_HASH`,
     already a constant — enforced at node startup rather than only on CLI `join`.
   - Then delete the forge path instead of flagging it. A new genesis would
     necessarily be a different network, visibly and by construction.

   Wide change: dozens of selftests plus node startup validation on a live tip.
   Worth one coherent pass rather than a partial one.

1. **Soundness gate — CLOSED 17 Aug 2026.** Twelve fixes, each with a test that failed
   first: membership as a fold over history (a stranger could produce), the legacy
   signature era (`verifyChain` rejected pixels 0–12), the mempool door (300
   unauthenticated curls minted 15,050 PIX), gossip wire validation, sequence and
   transaction-identity binding, `field`/`wave` body binding, fees ≠ issuance,
   gift-and-record moved into `acceptBlock`, accept/verify parity as a property, node
   key sealing, and a coverage harness that fails the build when a consensus field,
   route or message arrives unaccounted for. See [`STATE-2026-08-17.md`](./STATE-2026-08-17.md).
   **Prerequisite for everything below involving a second operator.**
2. **Second-operator structural work** — fork choice over a block tree (currently depth-1,
   so two honest nodes partitioned for two pixels cannot converge) and a finality rule
   anchored to the public venues. Then two operators proven by killing one.
3. Commission external Gate I review from [`AUDIT.md`](./AUDIT.md) scope; publish report link
4. Decide the emission question — the ceiling is 10,300,000,000 and flat emission reaches it exactly, but PoLS still has no expensive work to subsidise, so whether a per-pixel reward belongs here at all is open ([`EMISSION.md`](./EMISSION.md))
5. Public testnet ULA links (Sepolia) + deepen on-chain ML-DSA beyond commit gate when gas path exists
6. [x] Opt-in ML-KEM sealed gossip (`PIXEL_TRANSPORT_KEM=1`, `test:kem-wire`) — default still plaintext
7. [x] Continuity merchant handshake (one-button join) + map fee / till-on-origin-dark bookkeeping — agentic booth runners still held
8. [x] Lab chaos drill + till ledger accrual (`test:chaos-drill`) — not Gate J public evidence
9. [x] **FieldWitness invent** — sphere combination lock: peer indices, distance, opacity ∈ {opaque, translucent, lit}; tip PoLS binds `fieldDigest`; `acceptBlock` recomputes and rejects mismatch (`bun run test:field`, SPEC § FieldWitness). **PATH note: invent gate evidence — not a rename of `prevHash`.** Verification, continuity of the scene, custody of the tip.
10. [~] **World canvas + people wallet** — frame + lab `/wallet` pay-on-tip + billboard honesty + tip-mark / canvas id + shared-tip attach (`test:wallet`, `test:tip-mark`, `test:shared-tip`, [`WORLD-CANVAS.md`](./WORLD-CANVAS.md)); tip-host contract + `VITE_REQUIRE_PUBLIC_TIP` (`test:tip-host`, [`CANONICAL-TIP.md`](./CANONICAL-TIP.md)); public tip live at `https://pixel-tip-production.up.railway.app`. Still open: **ops** — wire that URL into production `VITE_PIXEL_RPC` (+ require flag) on Lovable. Lab `init` stays for builders only.
11. [~] **Spatial lattice invent** — meat behind the 3D/light vision ([`SPATIAL.md`](./SPATIAL.md)): S1–S4 tip physics + Lock→lead; S5 Three.js UI sink (`test:spatial-sink`, `/spatial`). Still open: WASM/octree only if benches demand. Dream ≠ voxel mainnet claim.
12. Keep `pix_protocolInfo` gates honest as evidence lands

Gate D is in. Gate I package is preparing. Continuity desk can drill origin-dark → till accrue in lab — still a pilot, not a costume. FieldWitness is invent evidence for tip custody as a sphere lock — not simile alone. World canvas is the people-facing north star: one picture, wallet-held, tip-marked — not everyone lighting a private notebook.

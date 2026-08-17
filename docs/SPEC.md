# Pixel Ledger — Minimal Spec (v0.2)

Status: **draft, implemented in this repo.** Normative text is what the tests enforce —
and since 16 August 2026 that sentence is itself enforced rather than asserted.

`scripts/spec-conformance-selftest.ts` parses the constants table in §2.1 out of this
file and asserts every value equals the exported constant in code. When the two
disagree the build fails, so this document cannot drift from the protocol the way its
economics section did: for five days §5 specified a 21,000,000 cap and a halving that
the code had already replaced, while the line above still called itself normative.

| Section                         | Enforced by                                              |
| ------------------------------- | -------------------------------------------------------- |
| §2.1 constants                  | `test:spec-conformance`                                  |
| §2 cryptography                 | `test:crypto` `test:mldsa` `test:vectors` `test:sig-era` |
| §4 consensus                    | `test:pixel` `test:l1` `test:election` `test:fault`      |
| §4.2 membership                 | `test:membership` `test:electable-drift`                 |
| §4.3 block validity             | `test:coverage-harness` `test:parity` `test:adversarial` |
| §5 economics                    | `test:claims-guard` `test:fee-accounting` `test:scale`   |
| §7 wire                         | `test:wire-schema` `test:net` `test:four-node`           |
| all of it, against real history | `test:crowned-replay`                                    |

## 1. Identity

- Name: **Pixel Ledger** (not a “blockchain of blocks”)
- Settlement unit: **pixel** (illuminated ledger cell)
- Native asset: **PIX** (hard cap 10_300_000_000; base unit 1e8)
- Builder fuel: **Light Credits** (uncapped; not monetary)
- Consensus: **Proof of Light Sequence (PoLS)**
- API face: **Source · Word · Light** (`One`)

## 2. Cryptography (current)

| Piece                     | Algorithm                   | Notes                                                                 |
| ------------------------- | --------------------------- | --------------------------------------------------------------------- |
| Hash                      | SHA-512                     | Via Web Crypto / runtime                                              |
| Signatures (OTS)          | PIX-HASH-OTS-128            | Merkle window of Lamport OTS leaves (32); each sign consumes one leaf |
| Signatures (PQ multi-use) | **PIX-ML-DSA-65**           | NIST FIPS-204 via `@noble/post-quantum`; domain-separated             |
| Surface                   | `signPixel` / `verifyPixel` | Scheme id in signature envelope                                       |
| Not used                  | ECDSA / Ed25519             | Classical ECC is out of scope for Pixel sigs                          |

Invariant: signature scheme is **versioned** and crypto-agile.  
Invariant: `verifyLight` (weak) is fail-closed; only scheme verifiers accept.  
Invariant: address ↔ public key binding is checked on PoLS proofs (scheme-aware).  
Invariant: PIX-HASH-OTS-128 `(publicKey, leafIndex)` is **single-use at consensus** (`usedOtsLeaves`; reuse → `OTS_LEAF_REUSED`). ML-DSA is multi-use.  
Priority: quantum security is **critical** — see [`QUANTUM.md`](./QUANTUM.md).

Leader election (lab): lowest `SHA-512(pols-lottery|prevHash|sequence|address)` among the **electable set bound into the light proof** (`electable[]`, committed as `el=` in the PoLS message). Public-input verifiable; **not** VRF/BFT. Registry growth after a pixel must not rewrite that pixel’s lottery.

### 2.1 Constants

Machine-checked against code by `test:spec-conformance`. A value here that no longer
matches its export fails the build.

| Constant                      | Value         | Module               |
| ----------------------------- | ------------- | -------------------- |
| `PIX_HARD_CAP`                | `10300000000` | `economics.ts`       |
| `PIX_BASE_UNITS`              | `100000000`   | `economics.ts`       |
| `GENESIS_LIGHT_REWARD`        | `50`          | `economics.ts`       |
| `LIGHT_HORIZON`               | `206000000`   | `economics.ts`       |
| `POLS_STALL_MS`               | `15000`       | `pol.ts`             |
| `POLS_MAX_SKIP`               | `8`           | `pol.ts`             |
| `POLS_MAX_FUTURE_DRIFT_MS`    | `120000`      | `pol.ts`             |
| `MEMBERSHIP_ACTIVATION_DELAY` | `8`           | `membership.ts`      |
| `LEGACY_SIG_ERA_END_HEIGHT`   | `13`          | `sig-era.ts`         |
| `MAX_BLOCK_TXS`               | `4096`        | `limits.ts`          |
| `MAX_BLOCK_TX_BYTES`          | `2097152`     | `limits.ts`          |
| `MAX_METADATA_BYTES`          | `4096`        | `limits.ts`          |
| `MAX_PENDING_TX`              | `4096`        | `limits.ts`          |
| `MAX_PIXELS_PER_MESSAGE`      | `512`         | `limits.ts`          |
| `MAX_GOSSIP_FRAME_BYTES`      | `8388608`     | `limits.ts`          |
| `CROWNED_NETWORK_ID`          | `20553`       | `crowned-genesis.ts` |

## 3. State

```
State = {
  networkId,
  pixels: LedgerPixel[],
  utxos: Map<txid:vout, Utxo>,
  pending: Transaction[],  // superposition
  sequencers: { address, publicKey }[],
  usedOtsLeaves: Set<`${publicKey}:${leafIndex}`>
}
```

### LedgerPixel

- Links: `prevHash`, `index`, `sequence`
- Body: `transactions[]`, `merkleRoot`
- Light: `lightProof` (beacon + sequencer sig + `fieldDigest` + `waveDigest` + `spatialRoot`)
- Appearance: `color`, `illuminated`, `proximity[]`
- Field: `field[]` — peer `FieldWitness` records (sphere combination lock)
- Invariant: `illuminated = false` ⇒ color absent (no RGB meaning)
- Invariant: `lightProof.fieldDigest` matches recomputed digest of peer field; mismatch ⇒ reject
- Invariant: `lightProof.spatialRoot` matches sparse occupancy Merkle of illuminated cells; mismatch ⇒ reject

### FieldWitness (sphere combination lock)

Tip custody is not linear `prevHash` alone. Peers form a field in **lattice space** (`index → (x,y,z)` packing, S1 z=0 slice — [`SPATIAL.md`](./SPATIAL.md)):

| Lattice Chebyshev-3 | opacity       | weight | color in digest     |
| ------------------- | ------------- | ------ | ------------------- |
| 0                   | `lit`         | 1      | full peer `#rrggbb` |
| 1                   | `translucent` | 0.5    | full peer `#rrggbb` |
| ≥ 2 (≤ max)         | `opaque`      | 0      | empty (no color)    |

Peers = prior pixels with Chebyshev-3 ≤ `FIELD_MAX_DISTANCE` (2) of the tip.  
Canonical `fieldDigest = SHA-512(field|v2|blend=<hex>\|<peerIndex>@x,y,z:distance:opacity:weight:color|…)` (peers sorted by index; `blend` = opacity-weighted RGB mix). Bound into the PoLS message as `|field=<digest>`. `acceptBlock` / `verifyChain` recompute from prior pixel colors and reject mismatch.

**Invent note:** verification + continuity of the scene + tip custody — **not** a rename of `prevHash`, **not** a game voxel engine. Evidence: `bun run test:field` · `bun run test:lattice`.

### Lead wave (lattice propagation)

Tip illumination emits a deterministic multi-hop wave over occupied lattice cells (`WAVE_MAX_HOPS = 2`). Seed = `prevHash|sequence|merkleRoot`. Hits record `(cellIndex, hop, amplitudeMilli, leadIndex)`. Amplitude decays by named constant `WAVE_DAMPING = 0.55` per hop (`wave-rules-v1` — consensus-critical). Prior tips within `WAVE_LOOKBACK` leave residue; overlapping cells **collision-fold** by sorting `(leadIndex, leadTipHash)` then mixing amplitudes (not wall-clock order). Neighbor occupancy uses a tip-equivalent **hash grid** (`spatial-index.ts`) — local acceleration, not a PoLS field.

Canonical `waveDigest = SHA-512(wave|v1|<cell>:<hop>:<amp>:<lead>|…)`. Bound into the PoLS message as `|wave=<digest>`. `acceptBlock` / `verifyChain` recompute and reject mismatch. Lab energy-cost: `waveEnergyCostMilli(hits)` — labeled model, not Energy Truth Joules / not PIX gas.

**Invent note:** neighbor reaction is tip physics — **not** UI glitter. Evidence: `bun run test:wave` · `test:spatial-index` · `test:wave-partition`. Path: [`SPATIAL.md`](./SPATIAL.md) S2–S4.

### Wave fan-out (node notify plane)

After a tip is sequenced, accepted, or replaced, the node emits an async `WaveFanoutEvent` (`tipIndex`, `waveDigest`, `hits`, `source`) on a local bus (`wave-bus.ts`). Subscribers and `GET /wave/tip` may observe hits without blocking PoLS. **The bus is not consensus truth** — `acceptBlock` / `verifyChain` still recompute `waveDigest` from tip inputs and reject mismatch.

**Invent note:** event-driven propagation for UI/ops — tip-recomputable only. Evidence: `bun run test:wave-fanout`. Path: [`SPATIAL.md`](./SPATIAL.md) S4.

### Spatial sink (Three.js UI)

`SpatialSinkPanel` / `/spatial` maps tip `spatialRoot` cells and optional wave hits into a Three.js viewport. **Display only** — the browser never authors digests; `acceptBlock` still recomputes. Adapter: `spatial-sink.ts`.

**Invent note:** replaces matplotlib demos without a second ledger. Evidence: `bun run test:spatial-sink`. Path: [`SPATIAL.md`](./SPATIAL.md) S5.

### Spatial picture (sparse occupancy Merkle)

Illuminated tips form a sparse occupancy set in lattice coords. Leaves are sorted `(x,y,z,index)` with `SHA-512(spatial-cell|coord|index|color|lit)`. Merkle parent `SHA-512(left|right)` (odd last leaf duplicated). Empty picture → `SHA-512(empty-spatial-root)`.

Canonical `spatialRoot` bound into the PoLS message as `|spatial=<root>`. `acceptBlock` / `verifyChain` recompute from tip pixels and reject mismatch. Light clients prove “cell lit” via Merkle path against tip `spatialRoot` (`HeadersSyncPackage.spatialRoot`, `GET /spatial/proof/:index`).

**Invent note:** verifiable illuminated picture fragment — **not** a matplotlib demo. Evidence: `bun run test:spatial-proof`. Path: [`SPATIAL.md`](./SPATIAL.md) S3.

### Transaction

- UTXO inputs/outputs
- Human `metadata` (signed)
- `commitment` while `state = superposition`
- `privacy ∈ {public, private, selective}`

## 4. PoLS

1. Pending txs sit in superposition (no color).
2. `electable =` current sequencer registry (ordered); bound into the light proof.
3. `nextSequencer = argmin SHA-512(pols-lottery|tipHash|sequence|addr)` over `electable` (skip=0).
4. Elected sequencer builds pixel: coinbase light-reward + pending txs.
5. Signs light proof (message includes `el=` commitment, `|field=`, `|wave=`, `|spatial=`); peers `acceptPixel` with full verify.
6. UTXO set updates; pending cleared/conflict-dropped.

Invariant: `lightProof.electable` is the lottery set for that height; every address in it must be in the local registry; join/register after the fact cannot change prior elections.
Invariant: `lightProof.fieldDigest` is the sphere lock for that tip; wrong neighbor effects ⇒ reject.
Invariant: `lightProof.waveDigest` / `spatialRoot` are neighbor physics + picture occupancy; mismatch ⇒ reject.

### 4.1 Fault path (Gate C — lab)

If the elected sequencer is silent past `POLS_STALL_MS` (default 15s) after pending appears:

1. `skipCount` advances: elected = rotate `skipCount` steps from the skip=0 choice.
2. Light-proof message binds `skip=N` (`pols|…|skip=N`).
3. Peers accept only if stall window elapsed (`pendingSince` or parent tip time + `POLS_STALL_MS`).
4. **Fork-choice (depth 1):** at equal height prefer lower `skipCount`, then lower hash (`preferPixel` / `replaceTipIfBetter`).

This is **not BFT**. Assumed: loosely synchronized clocks, honest majority of sequencers over time. Max skip per height: `POLS_MAX_SKIP`.

Invariants:

- Only the skip-elected sequencer may produce pixel `n+1` for that `skipCount`
- Peers reject bad merkle, bad proof, bad color composition, bad fieldDigest / waveDigest / spatialRoot, bad linkage, unjustified skip
- Light reward obeys emission schedule and hard cap
- On-time (`skip=0`) always preferred over skip tips at the same height

### 4.2 Sequencer membership

The electable set at height `H` is a **fold over the membership records committed in
pixels below `H`**, seeded with the producer of genesis. It is a pure function of
history: no gossip, no clock, no local registry. Two nodes holding the same pixels
compute the same set, so a block's validity cannot depend on which hello arrived first.

- A `sequencer-join` record carries **possession** (a signature by the joining key, so
  nobody can enrol an address they do not hold, or be blamed for a block) and
  **authorization** (a signature by a member already active at the height of inclusion,
  verified against the key history records for that member).
- `includedAt` is signed and must equal the index of the carrying pixel, so a record
  cannot be lifted into a more convenient block.
- A record takes effect `MEMBERSHIP_ACTIVATION_DELAY` pixels after inclusion. The set
  that elects a producer is therefore strictly older than the block it produces, so no
  producer can be elected by a set it wrote itself.
- The founding producer cannot be removed. A chain that can empty its electable set has
  nobody left who could authorise a join.
- `state.sequencers` is a public-key lookup for display. **Validation never reads it.**

Invariant: a block must bind an `electable` set byte-identical to the fold at its own
height. Enforced identically by `acceptBlock` and `verifyChain`.

#### 4.2.1 Hybrid bond door (DRAFT — not normative on network 20553)

**Status:** designed in [`DURABILITY.md`](./DURABILITY.md); **not shipped**. Invitation-only
(§4.2) remains the only electable path on the crowned network until vectors and a fresh
network id land.

Intent (locked 2026-08-17):

- Sequencer seats are for **bonded full verifiers** (or invitees), not a separate miner caste.
- **Rejected:** proof-of-work admission; Light-Credits-gated seats.
- While electable count ≥ `K`, invitation (possession + authorization) remains available.
- If electable count < `K` for longer than `T`, one PIX-bond claim may enter per window.
- Phones may lock bonds as light verifiers; only a **carry**-opted reachable subset enters
  the producer lottery (`POLS_MAX_SKIP` cannot cover millions of asleep devices).
- Provisional lab parameters (inactive): `K=2`, `T=10080` minutes, bond floor `50 PIX`.

### 4.3 Block validity

Every field of a pixel is either recomputed from prior state, committed inside a hash
preimage that is itself recomputed, or explicitly checked. `test:coverage-harness`
holds the full field-by-field registry and fails the build when a consensus type grows
a field nothing binds.

Normative rules a validator applies, beyond §4:

- `index === tip.index + 1`, and on replay `index` equals the pixel's own position.
- `sequence === tip.sequence + 1`. Sequence is the lottery's input, so an unbound
  sequence is a grinding lever.
- `lightProof.sequence === sequence` and `lightProof.prevHash === prevHash`. The proof
  must describe the pixel it is attached to.
- `lightProof.scheme` is **required** and must equal the algorithm inside its own
  signature. There is no default: a default that picks cryptography is a failure that
  renders as an ordinary state.
- Every transaction's `txid` and `commitment` are recomputed from its canonical body.
- Every transaction is `revealed` or `final`, and its `lightSequence` — when present —
  equals the sequence of the pixel carrying it.
- `field` and `wave` are compared as **arrays**, not merely as digests. The picture a
  node serves is the picture consensus agreed on.
- Bounds are checked **before** any signature verification: `MAX_BLOCK_TXS`,
  `MAX_BLOCK_TX_BYTES`, `MAX_METADATA_BYTES`.
- Accept and replay agree: `acceptBlock` succeeding on a block is equivalent to
  `verifyChain` accepting the chain it produces (`test:parity`).

### 4.4 Signature eras

Signature rules changed once in this chain's life. Commit `c8d5d54` moved ML-DSA domain
separation into the FIPS-204 `ctx` parameter, widened the OTS signed digest from 128 to
256 bits, and added a length-prefixed OTS domain tag — with no migration, leaving the
first thirteen pixels unverifiable by every later version of the code.

On network `CROWNED_NETWORK_ID`, pixels below `LEGACY_SIG_ERA_END_HEIGHT` verify under
the pre-`c8d5d54` constructions and everything at or above it verifies under the current
ones. Exactly one era applies at any height; a verifier must **never** fall back between
them, because a fallback is a downgrade oracle. The era is closed above, applies to no
other network, and has no signing path — those constructions are readable history, not
an available option.

## 5. Economics

- Genesis reward: 50 PIX at pixel 0
- Flat emission: 50 PIX per pixel, no halving
- Horizon: 206_000_000 rewarded pixels, which reaches the cap exactly
- Cap: 10_300_000_000 PIX — one per human alive at the projected peak of humanity
- No burn
- Bridge value uses **lock/escrow**, not destruction
- **Bridge custody inversion:** foreign chain holds receipts only; Pixel holds the vault; foreign verify alone never releases master PIX (`BRIDGE_CUSTODY_AXIOM`, `bun run test:bridge-custody`)
- Dev/agent/SISO ops spend **Light Credits**, not the hard cap

## 6. SISO / Continuity

Artifacts register by **content digest** (any language/host).  
States: `outside → in_superposition → in_the_light → origin_dark`.  
No parallel-VM rewrite required.

## 7. Wire (gossip)

WebSocket JSON messages:

- `hello` (optional `helloSig`), `tx`, `pixel`, `get_pixels`, `pixels`, `get_headers`, `headers`

HTTP:

- `POST /rpc` JSON-RPC (`pix_*` including `pix_getHeaders`, `pix_getBalanceProof`)
- `GET /health`, `GET /sync`, `GET /sync/headers`, `GET /pixels`, `GET /balance/:addr[/proof]`

## 8. What this version does / does not claim

**Does:** local + multi-node sequential accept, persist, One API, SISO model, off-chain ULA package, Merkle-window hash-OTS (ledger single-use), diversity _policy_ when ≥7 providers registered, Gate B gossip join, Gate C lab stall-skip, Gate E ULA twin + custody inversion, Gate F headers-first + balance proofs + signed hello scoring (lab), 4-node lab mesh.

**Does not yet:**

- Global provider mesh / full BFT under partition (Gate C is timeout-skip + depth-1 tip replace, not quorum)
- ML-DSA defaulted for all new wallets / on-chain ULA verify of Dilithium (in-process ML-DSA **does** ship)
- Two-phone field hardening / device attestation beyond raster+getUserMedia path
- Kindling anti-phishing complete — `optical-capture` channel ships; remote device attestation still thin
- Audited production bridge — lab `ULAVerifier.sol` verifies keccak-OTS twin (`IS_STUB=false`); public testnet links + audit still open (see `BRIDGE-STATUS.md`)
- Production gossip (no peer auth, fragile catch-up)

Frame this honestly: a coherent lab prototype with real running crypto and UTXO settlement — **Gate A** on the path to an L1 / bridge / sovereignty regime.  
Destination and claim unlocks: [`PATH.md`](./PATH.md). Do not claim Gates B–J until their evidence exists.

# Pixel Ledger — Minimal Spec (v0.2)

Status: **draft, implemented in this repo**. Normative text is what the tests enforce.

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

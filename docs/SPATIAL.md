# Spatial lattice — invent path (meat behind the light)

**Stance:** dream ≠ claim. The world canvas is one public picture; FieldWitness already locks tip custody to neighbor effects. What the external review correctly named as missing is a **true spatial core** — coords, propagation, blending — still bound to tip verification, not a disconnected voxel toy.

**Creed:** every light verb touches verification, continuity, or custody. A Python sandbox that never hits `acceptBlock` is research, not Pixel settlement.

Related: [`PATH.md`](./PATH.md) · [`SPEC.md`](./SPEC.md) § FieldWitness · [`WORLD-CANVAS.md`](./WORLD-CANVAS.md) · `src/lib/pixel/field-witness.ts` · `src/lib/pixel/lattice.ts`.

---

## Email assessment (honest map)

| Reviewer said                               | Repo today                                                                   | Verdict                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| Strong SISO / PQ / UTXO / Continuity / docs | Real, gated                                                                  | Keep                                        |
| Missing 3D voxel / adjacency / neighbor CA  | FieldWitness is a **1D index window** labeled “sphere”; UI packs 2D for show | **Gap — invent path below**                 |
| Light as finality flag, not wave            | `illuminated` + spectrum color; no hop propagation                           | **Gap — S2**                                |
| Scalability at voxel scale                  | In-memory tip chain; no spatial index / shard                                | **Later (S4–S5)** — not claim until benches |
| Consensus depth in spatial context          | PoLS + fieldDigest reject wrong peers; no formal 3D BFT paper                | Harden after geometry unifies (S1–S3)       |
| Spatial commitments / picture proofs        | `spatialRoot` occupancy Merkle in PoLS (`test:spatial-proof`)                | **S3 done**                                 |
| Edge tests (waves, partitions)              | `test:field` forge reject; not wave collision sims                           | **S2–S4**                                   |

**What we refuse from the sample Python module:** shipping a separate `PixelLedger` class that never signs PoLS. Study the ideas (sparse cells, lead activation, decay, RGB mix). **Port invent into tip-bound TypeScript** — or WASM later — so wrong neighbor physics fail `acceptBlock`.

---

## Destination model (one picture, spatial)

```text
Lead illumination (tx settles on tip)
    → lattice coords of tip + peers
    → neighbor reactions (opacity-weighted blend / wave)
    → fieldDigest + waveDigest + spatialRoot in PoLS
    → peers recompute; mismatch ⇒ reject
    → Billboard / world canvas shows the same picture
```

Latent / “superposition” language stays **lab**: UTXO pending is already pre-reveal; wave + picture are tip-bound.

---

## Phases (build in order)

### S0 — Path + honesty (this doc)

- [x] Gap map vs FieldWitness / UI packing / optical 16×16 (keys, not voxels)
- [x] Explicit: no claim of global voxel mainnet

### S1 — Unify geometry + weighted blend (lab invent)

**Build**

- [x] Deterministic `index → (x,y,z)` packing (`lattice.ts`)
- [x] Field peers = prior pixels within **lattice Chebyshev ≤ FIELD_MAX_DISTANCE** (not only `|Δindex|`)
- [x] `opacityWeight` enters digest + `neighborBlend` hex (`field|v2|…`)
- [x] `test:field` + `test:lattice` reject forge / wrong blend

**Evidence:** `bun run test:field` · `bun run test:lattice` · SPEC § FieldWitness updated  
**Claim unlock:** “Tip sphere lock uses lattice Chebyshev + weighted peer blend peers recompute.”  
**Forbidden:** “Full 3D voxel L1.”

### S2 — Lead wave / neighbor reaction on tip

**Build**

- [x] Deterministic multi-hop BFS from lead tip coords (`wave.ts`, `WAVE_MAX_HOPS=2`)
- [x] Collision fold when overlapping leads: sort `(leadIndex, tipHash)` then mix amplitudes
- [x] `waveDigest` bound in PoLS (`|wave=`); `acceptBlock` / `verifyChain` reject tamper
- [x] Selftest: stable collision + forged waveDigest fails

**Evidence:** `bun run test:wave` · SPEC § Lead wave  
**Claim unlock:** “Neighbor reaction is tip physics, not UI glitter.”

### S3 — Spatial commitment (picture proof)

**Build**

- [x] Sparse occupancy map for illuminated cells (`spatial-picture.ts`)
- [x] `spatialRoot` Merkle over occupied coords → bound in PoLS (`|spatial=`)
- [x] `acceptBlock` / `verifyChain` recompute; forged root rejected
- [x] Light client: prove/verify “cell lit” + `HeadersSyncPackage.spatialRoot`
- [x] RPC: `pix_getSpatialSnapshot`, `pix_proveIlluminatedCell`; REST `GET /spatial/snapshot`, `GET /spatial/proof/:index`

**Evidence:** `bun run test:spatial-proof` · SPEC § Spatial picture  
**Claim unlock:** “Verifiable illuminated picture fragment.”

### S4 — Scale & fault

**Build**

- [x] Async/event-driven wave fan-out on the node (still tip-recomputable) — `wave-bus.ts`, node emit after sequence/accept/replace; `GET /wave/tip`
- [x] Spatial index (hash grid) for occupied cells — `spatial-index.ts`; tip-equivalent neighbor queries; octree deferred to S5 benches
- [x] Damping / energy-cost as labeled lab rules — `WAVE_DAMPING=0.55` consensus-critical inside amplitudes; `waveEnergyCostMilli` labeled model (`wave-rules.ts`)
- [x] Partition / conflicting-wave sims in CI — `test:wave-partition`
- [x] Storage growth control notes in THREAT-MODEL (lab wave/index growth)

**Evidence:** `bun run test:wave-fanout` · `test:spatial-index` · `test:wave-partition`  
**Claim unlock:** fan-out = notify plane; index = local acceleration; damping named in digest path; partition sim = lab reject — **not** Gate F scale benches, **not** BFT under partition.

### S5 — Acceleration (optional)

- [x] Three.js / web viz as **UI sink** (never consensus source) — `SpatialSinkPanel` / `/spatial`, adapter `spatial-sink.ts`, `test:spatial-sink`
- WASM/Rust port of lattice + wave + occupancy Merkle hot path
- Octree only if hash-grid benches fail (not costume)
- GPU only if benches prove need — never as costume

**Evidence (sink slice):** `bun run test:spatial-sink` · `bun run build`  
**Claim unlock:** “Tip picture viewable in Three.js — display only.”

---

## Module map

| Module                    | Role                                                     |
| ------------------------- | -------------------------------------------------------- |
| `field-witness.ts`        | Tip sphere lock + `fieldDigest` (extend, don’t fork)     |
| `lattice.ts`              | Coords, Chebyshev3, blend, lead-wave helpers             |
| `wave.ts`                 | Multi-hop lead wave + collision fold + `waveDigest`      |
| `wave-rules.ts`           | Named `WAVE_DAMPING` + lab energy-cost milli             |
| `wave-bus.ts`             | Local async fan-out after tip — notify, not consensus    |
| `spatial-index.ts`        | Hash-grid occupancy — local acceleration, not PoLS       |
| `spatial-picture.ts`      | Sparse occupancy Merkle + cell proofs + `spatialRoot`    |
| `light-color.ts`          | Align `revealProximity` packing with lattice             |
| `pol.ts` / `chain.ts`     | Bind + enforce field / wave / spatial digests            |
| `light-client.ts`         | Headers sync carries `spatialRoot`; cell proof check     |
| `LedgerField.tsx`         | Sink — render coords when present; never source of truth |
| `spatial-sink.ts` + panel | Three.js tip picture — UI sink only (`/spatial`, `/lab`) |
| Future `lattice/` or WASM | Only after S1–S3 green                                   |

---

## Where we are vs advisor wishlist

Honest map of the external “Python voxel → TS port → RPC → USDC” checklist against tip-bound invent:

| Advisor ask                                         | Status                                                                 | Notes |
| --------------------------------------------------- | ---------------------------------------------------------------------- | ----- |
| Run Python file → console + matplotlib 3D “picture” | **Rejected as consensus**                                              | Ideas only (sparse cells, lead, decay). Not a settlement path. |
| Port Voxel + propagation to TS / Map or octree      | **S1–S4 invent path**                                                  | `lattice` + `wave` + occupancy Merkle + hash-grid index. Octree optional S5 if benches demand. |
| Real PQ signatures on lead activations              | **Done on tip path**                                                   | PoLS already signs with PIX-HASH-OTS / ML-DSA; lead wave + picture are inside that signed message. |
| Async/event-driven propagation for the node         | **Done (S4 fan-out)**                                                  | `wave-bus` + node `onWaveHits` after sequence/accept/replace; `test:wave-fanout`. Tip still recomputes `waveDigest`. |
| Damping, conflict resolution, energy cost tracking  | **Done (lab rules)**                                                   | Collision fold (S2); `WAVE_DAMPING` + `waveEnergyCostMilli` (`test:wave-partition`). Energy Truth = separate PoLS Joules plane. |
| Replace matplotlib with Three.js web viz            | **Done (UI sink)**                                                     | `SpatialSinkPanel` / `/spatial` — Three.js tip cells + wave hits; `test:spatial-sink`. Never consensus. |
| Drop into test harness alongside UTXO               | **Done**                                                               | Genesis / `sequenceBlock` / `acceptBlock` / `verifyChain` + spatial tests. |
| RPC: illuminate, activate_lead, get_snapshot        | **Partial**                                                            | Illuminate = existing tip path; spatial/wave snapshot RPC live. Lead = illuminated tip. |
| Wire USDC locks → lead pixel activations            | **Done (lab invent)**                                                  | `LockFeeder.activateLead` / `test:lock-lead` — lockDigest in shine-in reference; tip binds wave + spatial. Not mainnet USDC claim. |
| Rust version for production node                    | **Deferred (S5)**                                                      | Prefer tip-bound TS evidence first; WASM/Rust when benches demand. |

**Prefer next:** Hosted public tip as production default — or WASM/octree only if benches demand — over claiming voxel mainnet.

---

## MVP definition of done (reviewer’s ask)

> A module that manages a small lattice, demonstrates a transaction lighting a lead pixel and rippling to neighbors with visible state change, wired into the node/UTXO flow.

Pixel’s version of done (S1–S3):

1. Lead tip illuminates with lattice peers in `field[]`
2. Neighbor blend changes `fieldDigest`; wave hits bind `waveDigest`
3. Peer with wrong blend / wave / occupancy **fails** `acceptBlock`
4. Light client proves a cell is lit against `spatialRoot`
5. Billboard can show lattice-colored tip (UI follows digest)

Not done: Python viz as product, octree mainnet, WASM production node, “quantum connections” as marketing without gates.

---

## PATH

Track under immediate actions as **Spatial lattice invent (S1→S5)**. Escalate claims only when the phase evidence script is green — same doctrine as FieldWitness and world canvas.

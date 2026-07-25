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
| Spatial commitments / picture proofs        | Single SHA-512 fieldDigest; no occupancy Merkle                              | **S3**                                      |
| Edge tests (waves, partitions)              | `test:field` forge reject; not wave collision sims                           | **S2–S4**                                   |

**What we refuse from the sample Python module:** shipping a separate `PixelLedger` class that never signs PoLS. Study the ideas (sparse cells, lead activation, decay, RGB mix). **Port invent into tip-bound TypeScript** — or WASM later — so wrong neighbor physics fail `acceptBlock`.

---

## Destination model (one picture, spatial)

```text
Lead illumination (tx settles on tip)
    → lattice coords of tip + peers
    → neighbor reactions (opacity-weighted blend / wave)
    → fieldDigest (+ later spatialRoot) in PoLS
    → peers recompute; mismatch ⇒ reject
    → Billboard / world canvas shows the same picture
```

Latent / “superposition” language stays **lab**: UTXO pending is already pre-reveal; spatial latent is optional local sim until S2 binds wave steps to tip rules.

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

- Sparse occupancy map for illuminated cells
- `spatialRoot` Merkle (or hash tree) over occupied coords → optional PoLS bind
- Light client can verify “cell lit” against tip without full UTXO set

**Evidence:** `test:spatial-proof` + light-client extension  
**Claim unlock:** “Verifiable illuminated picture fragment.”

### S4 — Scale & fault

**Build**

- Spatial index (hash grid); optional shard by coord slab
- Partition / conflicting-wave sims in CI
- Storage growth control notes in THREAT-MODEL

**Claim unlock:** only with published benches (Gate F style).

### S5 — Acceleration (optional)

- WASM/Rust port of lattice + wave hot path
- GPU only if benches prove need — never as costume

---

## Module map

| Module                    | Role                                                     |
| ------------------------- | -------------------------------------------------------- |
| `field-witness.ts`        | Tip sphere lock + `fieldDigest` (extend, don’t fork)     |
| `lattice.ts`              | Coords, Chebyshev3, blend, lead-wave helpers             |
| `light-color.ts`          | Align `revealProximity` packing with lattice             |
| `pol.ts` / `chain.ts`     | Already bind + enforce digest                            |
| `LedgerField.tsx`         | Sink — render coords when present; never source of truth |
| Future `lattice/` or WASM | Only after S1–S3 green                                   |

---

## MVP definition of done (reviewer’s ask)

> A module that manages a small lattice, demonstrates a transaction lighting a lead pixel and rippling to neighbors with visible state change, wired into the node/UTXO flow.

Pixel’s version of done:

1. Lead tip illuminates with lattice peers in `field[]`
2. Neighbor blend changes `fieldDigest`
3. Peer with wrong blend / wrong coords **fails** `acceptBlock`
4. Billboard can show lattice-colored tip (UI follows digest)

Not done: Python viz, octree mainnet, “quantum connections” as marketing without gates.

---

## PATH

Track under immediate actions as **Spatial lattice invent (S1→S5)**. Escalate claims only when the phase evidence script is green — same doctrine as FieldWitness and world canvas.

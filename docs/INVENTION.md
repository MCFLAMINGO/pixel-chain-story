# Invention audit — what is ours vs borrowed

Skeptics will ask: _is this just other people’s work with new names?_  
Short answer: **primitives are borrowed; the composition and several surfaces are invented.** Respect comes from the invented parts being _real_ (tests + SPEC), not from denying Bitcoin/NIST.

## Borrowed (and fine)

| Piece                  | Source                                  |
| ---------------------- | --------------------------------------- |
| SHA-512                | Web Crypto / NIST                       |
| ML-DSA-65              | NIST FIPS-204 via `@noble/post-quantum` |
| UTXO accounting        | Bitcoin-shaped                          |
| 21M / halving math     | Bitcoin-shaped scarcity                 |
| Escrow lock pattern    | Standard Solidity                       |
| React / TanStack / Bun | Host stack                              |

Borrowing audited crypto is a virtue. Re-implementing Dilithium from scratch would be reckless.

## Invented / distinctive (ours)

<<<<<<< HEAD
| Piece                          | Why it is not a rename                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pixel as settlement unit**   | Illuminated cell + color-absent-without-light invariant                                                                                                                                  |
| **PoLS**                       | Deterministic light-sequence reveal — not PoW grind, not stake weight                                                                                                                    |
| **Lumen DSL**                  | `ghost` / `veil` / `shine` / `collapse` / `paint` → real UTXO state (`src/lumen/*`)                                                                                                      |
| **Kindling**                   | Mutual presence seal as _spend authorization_; SMS never spends                                                                                                                          |
| **Personal Source**            | Optical vault custody for non-coders                                                                                                                                                     |
| **Optical codec + capture**    | Luminance grid + getUserMedia/raster sample (`optical-capture.ts`)                                                                                                                       |
| **SISO**                       | Continuity without a forced rewrite VM                                                                                                                                                   |
| **FieldWitness**               | Sphere combination lock — lattice Chebyshev-3 peers, opacity + weighted blend; tip binds `fieldDigest`; mismatch rejects. **Not a rename of `prevHash`.**                                |
| **Lattice**                    | Spatial packing + neighbor blend meat for FieldWitness ([`SPATIAL.md`](./SPATIAL.md) S1→S5). Not a disconnected voxel sim.                                                               |
| **Lead wave**                  | Tip-bound multi-hop lattice hits + collision fold; `waveDigest` in PoLS (`test:wave`).                                                                                                   |
| **Spatial picture**            | Sparse occupancy Merkle over illuminated cells; `spatialRoot` in PoLS + light-client cell proofs (`test:spatial-proof`). Not a matplotlib toy.                                           |
| **Wave fan-out**               | Node-local async notify of tip wave hits after sequence/accept (`wave-bus`, `test:wave-fanout`). Tip still recomputes `waveDigest`.                                                      |
| **Spatial index / wave rules** | Hash-grid occupancy + named `WAVE_DAMPING` + lab energy-cost + partition sim (`test:spatial-index`, `test:wave-partition`).                                                              |
| **World canvas**               | One public picture of humanity — people wallets + tip marks; `CanvasId`; `shared_tip` via `POST /tx` ([`WORLD-CANVAS.md`](./WORLD-CANVAS.md), [`CANONICAL-TIP.md`](./CANONICAL-TIP.md)). |
| **Worldlight / LockFeeder**    | World artifacts + verified lock → shine-in                                                                                                                                               |
| **Lock→lead**                  | Named invent: USDC/USD lock → tip lattice lead (`activateLead`, `test:lock-lead`); lockDigest bound in shine-in reference.                                                               |
| **Energy Truth**               | Labeled model vs datacenter thirst                                                                                                                                                       |
| **Access ladder**              | Signal bridges invite only                                                                                                                                                               |
=======
| Piece                        | Why it is not a rename                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pixel as settlement unit** | Illuminated cell + color-absent-without-light invariant                                                                                                                                                     |
| **PoLS**                     | Deterministic light-sequence reveal — not PoW grind, not stake weight                                                                                                                                       |
| **Lumen DSL**                | `ghost` / `veil` / `shine` / `collapse` / `paint` → real UTXO state (`src/lumen/*`)                                                                                                                         |
| **Kindling**                 | Mutual presence seal as _spend authorization_; SMS never spends                                                                                                                                             |
| **Personal Source**          | Optical vault custody for non-coders                                                                                                                                                                        |
| **Optical codec + capture**  | Luminance grid + getUserMedia/raster sample (`optical-capture.ts`)                                                                                                                                          |
| **SISO**                     | Continuity without a forced rewrite VM                                                                                                                                                                      |
| **FieldWitness**             | Sphere combination lock — lattice Chebyshev-3 peers, opacity + weighted blend; tip binds `fieldDigest`; mismatch rejects. **Not a rename of `prevHash`.** |
| **Lattice**                  | Spatial packing + neighbor blend meat for FieldWitness ([`SPATIAL.md`](./SPATIAL.md) S1→S5). Not a disconnected voxel sim.                                                                                   |
| **Lead wave**                | Tip-bound multi-hop lattice hits + collision fold; `waveDigest` in PoLS (`test:wave`).                                                                                                                       |
| **Spatial picture**          | Sparse occupancy Merkle over illuminated cells; `spatialRoot` in PoLS + light-client cell proofs (`test:spatial-proof`). Not a matplotlib toy.                                                              |
| **Wave fan-out**             | Node-local async notify of tip wave hits after sequence/accept (`wave-bus`, `test:wave-fanout`). Tip still recomputes `waveDigest`.                                                                         |
| **Spatial index / wave rules** | Hash-grid occupancy + named `WAVE_DAMPING` + lab energy-cost + partition sim (`test:spatial-index`, `test:wave-partition`).                                                                               |
| **World canvas**             | One public picture of humanity — people wallets + tip marks; `CanvasId`; `shared_tip` via `POST /tx` ([`WORLD-CANVAS.md`](./WORLD-CANVAS.md), [`CANONICAL-TIP.md`](./CANONICAL-TIP.md)).                    |
| **Worldlight / LockFeeder**  | World artifacts + verified lock → shine-in                                                                                                                                                                  |
| **Lock→lead**                | Named invent: USDC/USD lock → tip lattice lead (`activateLead`, `test:lock-lead`); lockDigest bound in shine-in reference.                                                                                    |
| **Spatial sink**             | Three.js / web viz of tip illuminated cells + wave hits — UI sink only (`test:spatial-sink`). Not matplotlib-as-product.                                                                                     |
| **Energy Truth**             | Labeled model vs datacenter thirst                                                                                                                                                                          |
| **Access ladder**            | Signal bridges invite only                                                                                                                                                                                  |
>>>>>>> origin/main

## Lumen — evolve it (yes)

Lumen is already **real**: parser + interpreter drives genesis transfers in CI (`TRANSFER_LUMEN`).  
It is also **tiny**. To stay “something different,” expand it — do not abandon it for TypeScript-only demos.

**Hash simplification (shipped):** `lightDigest` + Lumen `digest` / `attest` / ray `exist` — authors never write domain-separated sha512 soup. L0: where light recomputes, verification survives (store of creation, not only wealth).

**Next Lumen work (ordered):**

1. [x] Surface a Lumen panel on `/lab` (edit ray → run → balances move)
2. [x] Product rays: `kindle`, `shine_in`, `holdings`/`balance`, `tip_sense`
3. [x] Language power class (vs Rust): `match`, `when aperture`, `ensure`/`refuse`, ray composition, field projection, ghost ownership
4. [x] `LumenRuntimeError` / parse errors in light vocabulary
5. [x] Persist modules beside chain (`lumen-modules.json` / localStorage) + typed rays (`checkLumen`)
6. Keep every ray mapped to real `One.*` / chain calls — no decorative DSL

See [`LUMEN.md`](./LUMEN.md).

## Optical — theater no longer

The scathing line was fair when capture was `simulateCameraCapture` only.  
**Now:** `getUserMedia` + canvas sample + raster round-trip; Kindling can seal with `channel: "optical-capture"`. Simulate remains for headless CI only.

## How to answer the skeptic

1. `bun run test:all` — including `test:optical`, `test:mldsa`, `test:kindling`
2. Point at `src/lumen/*` and `src/lib/pixel/optical-capture.ts`
3. Admit Bitcoin/NIST lineage for scarcity + PQ crypto
4. Claim only PATH gates that are green

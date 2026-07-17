# Invention audit — what is ours vs borrowed

Skeptics will ask: *is this just other people’s work with new names?*  
Short answer: **primitives are borrowed; the composition and several surfaces are invented.** Respect comes from the invented parts being *real* (tests + SPEC), not from denying Bitcoin/NIST.

## Borrowed (and fine)

| Piece | Source |
| --- | --- |
| SHA-512 | Web Crypto / NIST |
| ML-DSA-65 | NIST FIPS-204 via `@noble/post-quantum` |
| UTXO accounting | Bitcoin-shaped |
| 21M / halving math | Bitcoin-shaped scarcity |
| Escrow lock pattern | Standard Solidity |
| React / TanStack / Bun | Host stack |

Borrowing audited crypto is a virtue. Re-implementing Dilithium from scratch would be reckless.

## Invented / distinctive (ours)

| Piece | Why it is not a rename |
| --- | --- |
| **Pixel as settlement unit** | Illuminated cell + color-absent-without-light invariant |
| **PoLS** | Deterministic light-sequence reveal — not PoW grind, not stake weight |
| **Lumen DSL** | `ghost` / `veil` / `shine` / `collapse` / `paint` → real UTXO state (`src/lumen/*`) |
| **Kindling** | Mutual presence seal as *spend authorization*; SMS never spends |
| **Personal Source** | Optical vault custody for non-coders |
| **Optical codec + capture** | Luminance grid + getUserMedia/raster sample (`optical-capture.ts`) |
| **SISO** | Continuity without a forced rewrite VM |
| **Worldlight / LockFeeder** | World artifacts + verified lock → shine-in |
| **Energy Truth** | Labeled model vs datacenter thirst |
| **Access ladder** | Signal bridges invite only |

## Lumen — evolve it (yes)

Lumen is already **real**: parser + interpreter drives genesis transfers in CI (`TRANSFER_LUMEN`).  
It is also **tiny**. To stay “something different,” expand it — do not abandon it for TypeScript-only demos.

**Hash simplification (shipped):** `lightDigest` + Lumen `digest` / `attest` / ray `exist` — authors never write domain-separated sha512 soup. L0: where light recomputes, verification survives (store of creation, not only wealth).

**Next Lumen work (ordered):**
1. [x] Surface a Lumen panel on `/lab` (edit ray → run → balances move)
2. More rays: `kindle`, `shine_in`, `balance`, `when aperture`
3. Types / errors that talk in light vocabulary (not generic JS exceptions)
4. Persist modules beside chain state
5. Keep every ray mapped to real `One.*` / chain calls — no decorative DSL

See [`LUMEN.md`](./LUMEN.md).

## Optical — theater no longer

The scathing line was fair when capture was `simulateCameraCapture` only.  
**Now:** `getUserMedia` + canvas sample + raster round-trip; Kindling can seal with `channel: "optical-capture"`. Simulate remains for headless CI only.

## How to answer the skeptic

1. `bun run test:all` — including `test:optical`, `test:mldsa`, `test:kindling`  
2. Point at `src/lumen/*` and `src/lib/pixel/optical-capture.ts`  
3. Admit Bitcoin/NIST lineage for scarcity + PQ crypto  
4. Claim only PATH gates that are green

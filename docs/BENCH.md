# Pixel Ledger benchmarks

Generated: `2026-08-05T15:53:39.240Z` by `bun run bench:write`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation                        | Samples | avg ms | p95 ms | Note                               |
| -------------------------------- | ------: | -----: | -----: | ---------------------------------- |
| generateLightKeypair (hash-OTS)  |       3 | 191.78 | 224.44 | constrained / optical OTS keygen   |
| generatePixelKeypair (ML-DSA-65) |       3 |  10.57 |  23.39 | default node/wallet birth (Gate D) |
| signPixel (default scheme)       |       5 |  16.22 |  27.33 | per-transaction signature          |
| verifyPixel (default scheme)     |       5 |    4.6 |   5.21 | phone-capable verification         |
| propose + PoLS sequenceBlock     |       3 |  56.33 |  72.17 | full real settlement path          |
| verifyChain                      |       3 |  36.41 |  38.01 | full cryptographic audit of ledger |
| optical project + capture        |       5 |   0.19 |    0.6 | screen-light key channel           |
| verifyHeaderChain (tip)          |      20 |   5.96 |      — | Gate F headers-first               |
| prove+verifyBalanceProof         |      50 |   0.05 |      — | Gate F light balance               |

## How to regenerate

```bash
bun run bench:write
```

# Pixel Ledger benchmarks

Generated: `2026-08-05T00:43:53.382Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 188.57 | 217.48 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 8.13 | 14.5 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 20.12 | 52.71 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.62 | 5.45 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 73.39 | 100 | full real settlement path |
| verifyChain | 3 | 36.82 | 38.21 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.17 | 0.58 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 5.90 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.05 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

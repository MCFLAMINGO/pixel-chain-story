# Pixel Ledger benchmarks

Generated: `2026-07-19T03:36:11.938Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 90.58 | 98.97 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 7.38 | 12.35 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 39.7 | 42.58 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.99 | 6.01 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 110.72 | 131.98 | full real settlement path |
| verifyChain | 3 | 34.03 | 34.55 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.19 | 0.57 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 2.88 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.09 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

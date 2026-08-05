# Pixel Ledger benchmarks

Generated: `2026-08-05T04:35:11.033Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 189.72 | 218.37 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 9.52 | 19.43 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 14 | 31.69 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.6 | 5.34 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 64.73 | 87.21 | full real settlement path |
| verifyChain | 3 | 36.71 | 37.65 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.16 | 0.55 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 5.89 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.05 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

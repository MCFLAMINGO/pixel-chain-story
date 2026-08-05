# Pixel Ledger benchmarks

Generated: `2026-08-05T15:47:53.624Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 194.83 | 234.09 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 9.53 | 19.67 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 21.45 | 36.29 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.62 | 5.4 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 68.2 | 80.99 | full real settlement path |
| verifyChain | 3 | 36.64 | 37.61 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.18 | 0.62 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 6.18 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.05 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

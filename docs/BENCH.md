# Pixel Ledger benchmarks

Generated: `2026-08-05T00:28:44.395Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 96.72 | 121.02 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 9.81 | 21.13 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 42.95 | 43.48 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.63 | 5.43 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 50.36 | 76.46 | full real settlement path |
| verifyChain | 3 | 37.59 | 38.19 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.16 | 0.55 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 3.03 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.05 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

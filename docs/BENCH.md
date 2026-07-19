# Pixel Ledger benchmarks

Generated: `2026-07-19T00:57:40.107Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 86.13 | 93.52 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 7.33 | 10.92 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 18.07 | 19.12 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.43 | 5.03 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 52.68 | 80.64 | full real settlement path |
| verifyChain | 3 | 32.92 | 33.6 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.17 | 0.58 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 2.64 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.08 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

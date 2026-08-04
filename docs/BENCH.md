# Pixel Ledger benchmarks

Generated: `2026-08-04T23:55:02.753Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 98.92 | 128.5 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 8.22 | 15.03 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 33.23 | 33.57 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.55 | 5.27 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 57.82 | 70.65 | full real settlement path |
| verifyChain | 3 | 37.32 | 37.43 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.16 | 0.57 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 3.18 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.05 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

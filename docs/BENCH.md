# Pixel Ledger benchmarks

Generated: `2026-07-18T23:53:09.928Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 88.11 | 96.75 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 7.91 | 13.02 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 8.41 | 8.53 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.4 | 5.04 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 65.99 | 82.71 | full real settlement path |
| verifyChain | 3 | 33.97 | 34.02 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.17 | 0.55 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 2.65 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.09 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

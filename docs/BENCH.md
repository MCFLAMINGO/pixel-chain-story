# Pixel Ledger benchmarks

Generated: `2026-08-05T14:18:48.621Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 194.87 | 219.99 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 9.94 | 18.64 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 28.15 | 54.07 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 5.5 | 6.22 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 95.67 | 148.3 | full real settlement path |
| verifyChain | 3 | 41.28 | 42.98 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.2 | 0.73 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 6.45 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.05 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

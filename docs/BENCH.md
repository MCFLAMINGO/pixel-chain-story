# Pixel Ledger benchmarks

Generated: `2026-07-19T03:53:32.661Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 89.54 | 97.8 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 7.69 | 12.3 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 8.5 | 8.57 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.47 | 5.15 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 52.43 | 61.97 | full real settlement path |
| verifyChain | 3 | 33.66 | 33.95 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.16 | 0.53 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 2.67 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.07 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

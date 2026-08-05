# Pixel Ledger benchmarks

Generated: `2026-08-05T00:01:28.870Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 96.01 | 120.06 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 9.44 | 19.43 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 11.78 | 12.39 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.56 | 5.22 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 56.22 | 62.03 | full real settlement path |
| verifyChain | 3 | 37.22 | 39.28 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.16 | 0.55 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 3.08 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.05 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

# Pixel Ledger benchmarks

Generated: `2026-08-05T00:46:51.278Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 187.36 | 215.29 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 11.18 | 25.13 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 22.84 | 42.47 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.59 | 5.32 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 69.68 | 93.22 | full real settlement path |
| verifyChain | 3 | 37.37 | 38.19 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.16 | 0.56 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 5.98 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.05 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

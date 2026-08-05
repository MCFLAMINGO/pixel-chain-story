# Pixel Ledger benchmarks

Generated: `2026-08-05T15:20:46.698Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 191.39 | 222.58 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 10.11 | 21.01 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 47.36 | 106.42 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.63 | 5.36 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 54.43 | 59.91 | full real settlement path |
| verifyChain | 3 | 37.5 | 38.28 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.16 | 0.57 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 5.96 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.05 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

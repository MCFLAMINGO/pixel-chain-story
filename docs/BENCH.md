# Pixel Ledger benchmarks

Generated: `2026-08-05T00:39:05.103Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 193 | 229.84 | constrained / optical OTS keygen |
| generatePixelKeypair (ML-DSA-65) | 3 | 8.26 | 14.82 | default node/wallet birth (Gate D) |
| signPixel (default scheme) | 5 | 24.06 | 44.08 | per-transaction signature |
| verifyPixel (default scheme) | 5 | 4.65 | 5.45 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 63.85 | 73.03 | full real settlement path |
| verifyChain | 3 | 36.85 | 38.31 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.16 | 0.56 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 5.99 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.05 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

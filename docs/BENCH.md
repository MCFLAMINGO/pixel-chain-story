# Pixel Ledger benchmarks

Generated: `2026-07-18T18:43:33.602Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 88.07 | 96.74 | quantum-resistant keygen; once per wallet |
| signLightFull | 5 | 7.23 | 7.58 | per-transaction signature |
| verifyLightFull | 5 | 1.28 | 1.62 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 18.18 | 19.34 | full real settlement path |
| verifyChain | 3 | 10.26 | 11.16 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.16 | 0.53 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 2.64 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.07 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

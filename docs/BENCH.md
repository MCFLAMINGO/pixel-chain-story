# Pixel Ledger benchmarks

Generated: `2026-07-18T03:14:39.266Z` by `bun run test:bench`.

Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.

| Operation | Samples | avg ms | p95 ms | Note |
| --- | ---: | ---: | ---: | --- |
| generateLightKeypair (hash-OTS) | 3 | 88.51 | 96.13 | quantum-resistant keygen; once per wallet |
| signLightFull | 5 | 7.73 | 8.2 | per-transaction signature |
| verifyLightFull | 5 | 1.42 | 1.95 | phone-capable verification |
| propose + PoLS sequenceBlock | 3 | 18.46 | 19.76 | full real settlement path |
| verifyChain | 3 | 10.44 | 10.7 | full cryptographic audit of ledger |
| optical project + capture | 5 | 0.16 | 0.56 | screen-light key channel |
| verifyHeaderChain (tip) | 20 | 2.66 | — | Gate F headers-first |
| prove+verifyBalanceProof | 50 | 0.07 | — | Gate F light balance |

## How to regenerate

```bash
bun run test:bench
```

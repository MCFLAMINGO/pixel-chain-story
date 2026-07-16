# Threat Model (honest)

## Assets

- PIX balances / UTXOs
- Sequencer keys
- Continuity digests & mirrors (SISO)
- Bridge locks / ULAs

## Adversaries

| Adversary | Goal | Current mitigation | Gap |
| --- | --- | --- | --- |
| Double-spender | Replay inputs | UTXO consume on accept | Need mempool fee market under load |
| Fake sequencer | Forge pixels | PoLS election + sig verify | Need ≥7 diverse providers live |
| Cloud capture | Kill RPC/CDN | Diversity policy in code | Need real geo/provider set |
| Quantum attacker | Break classical sigs | Hash-OTS class | Migrate to ML-DSA in prod |
| Lying bridge relayer | Fake foreign mint | ULA verify on destination | Need audited on-chain verifiers |
| Eclipse / peer lie | Isolate node | Multi-peer design intent | Need peer scoring + headers-first sync |

## Non-goals (for now)

- Perfect privacy (ZK) — veils are coarse
- Instant global finality under partitions
- Replacing AWS compute — we provide **continuity**, not a universal VM

## Trust assumptions

1. Honest majority (or sufficient diversity) of sequencers over time  
2. SHA-512 preimage resistance  
3. Operators keep seeds offline / OS keystore  
4. Mirrors for SISO are actually reachable when origin dies  

If any assumption fails, say so in the client UI — never paper over it.

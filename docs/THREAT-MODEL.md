# Threat Model (honest)

**Frozen:** v1.1 (Gate I audit package)  
**Supersedes:** informal v1 table. Bump minor when adversaries/gaps change; bump major only with auditor agreement.

## Assets

- PIX balances / UTXOs
- Sequencer keys
- Continuity digests & mirrors (SISO)
- Bridge locks / ULAs
- Transport session secrets (when ML-KEM enabled — lab optional)

## Adversaries

| Adversary | Goal | Current mitigation | Gap |
| --- | --- | --- | --- |
| Double-spender | Replay inputs | UTXO consume on accept | Need mempool fee market under load |
| Fake sequencer | Forge pixels | PoLS election + sig verify (`acceptBlock`) | Need ≥7 diverse providers live |
| Cloud capture | Kill RPC/CDN | Diversity policy in code | Need real geo/provider set |
| Quantum attacker | Break classical sigs | No ECC; hash-OTS + **NIST ML-DSA-65** default birth | External audit (Gate I); full on-chain Dilithium deferred — see [`ULA-MLDSA.md`](./ULA-MLDSA.md) |
| Harvest-now-decrypt-later | Decrypt future captures of today’s traffic | Lab **ML-KEM-768** + XChaCha20-Poly1305 (`transport-kem.ts`) | Default gossip/RPC still **plaintext** |
| Lying bridge relayer | Fake foreign mint | Keccak-OTS twin on-chain + CosmWasm + frozen fixture; ML-DSA gate is trusted-submitter | Do not deploy for mainnet value; public testnet links pending (`BRIDGE-STATUS.md`) |
| Foreign ULA accept treated as spend | Unlock master PIX without Pixel vault | `BRIDGE_CUSTODY_AXIOM` + `assertVaultReleaseAuthorized` in `illuminateIngress` | `bun run test:bridge-custody` — verify alone leaves balances unchanged |
| Eclipse / peer lie | Isolate node | Signed hello + peer scoring + headers-first (Gate F lab) | Stronger eclipse resistance under adversarial mesh |
| Remote Kindling phish | Forge presence seal | Distinct `partyId` + commitment match | Simulated optical channel ≠ physical presence |
| Forgeable verifyLight | Any-msg accept | Removed (fail-closed); use verifyLightFull / verifyPixel | Keep weak API out of public surface forever |

## Non-goals (for now)

- Perfect privacy (ZK) — veils are coarse
- Instant global finality under partitions
- Replacing AWS compute — we provide **continuity**, not a universal VM
- Claiming “audited” before an external report lands in [`AUDIT.md`](./AUDIT.md)

## Trust assumptions

1. Honest majority (or sufficient diversity) of sequencers over time  
2. SHA-512 / keccak preimage resistance (as used by OTS / twin)  
3. Operators keep seeds offline / OS keystore  
4. Mirrors for SISO are actually reachable when origin dies  
5. For `ULAOffchainMldsaGate`: submitter actually verified ML-DSA off-chain before commit  

If any assumption fails, say so in the client UI — never paper over it.

## Consensus-critical code map (audit pointers)

| Name in docs | Implementation |
| --- | --- |
| acceptPixel (historical) | `acceptBlock` in `src/lib/pixel/chain.ts` |
| OTS single-use | `usedOtsLeaves` / `assertAndMergeOtsLeaves` |
| Scheme surface | `signPixel` / `verifyPixel` in `scheme.ts` |
| ULA twin | `contracts/ULAVerifier.sol` |
| ULA ML-DSA gate | `contracts/ULAOffchainMldsaGate.sol` |

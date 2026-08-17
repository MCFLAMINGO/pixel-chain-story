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

| Adversary                           | Goal                                       | Current mitigation                                                                     | Gap                                                                                              |
| ----------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Double-spender                      | Replay inputs                              | UTXO consume on accept                                                                 | Need mempool fee market under load                                                               |
| Fake sequencer                      | Forge pixels                               | PoLS election + sig verify (`acceptBlock`)                                             | Need ≥7 diverse providers live                                                                   |
| Cloud capture                       | Kill RPC/CDN                               | Diversity policy in code                                                               | Need real geo/provider set                                                                       |
| Quantum attacker                    | Break classical sigs                       | No ECC; hash-OTS + **NIST ML-DSA-65** default birth                                    | External audit (Gate I); full on-chain Dilithium deferred — see [`ULA-MLDSA.md`](./ULA-MLDSA.md) |
| Harvest-now-decrypt-later           | Decrypt future captures of today’s traffic | Lab **ML-KEM-768** sealed gossip via `PIXEL_TRANSPORT_KEM=1` (`test:kem-wire`)         | Default gossip/RPC still **plaintext**; not a TLS replacement                                    |
| Lying bridge relayer                | Fake foreign mint                          | Keccak-OTS twin on-chain + CosmWasm + frozen fixture; ML-DSA gate is trusted-submitter | Do not deploy for mainnet value; public testnet links pending (`BRIDGE-STATUS.md`)               |
| Foreign ULA accept treated as spend | Unlock master PIX without Pixel vault      | `BRIDGE_CUSTODY_AXIOM` + `assertVaultReleaseAuthorized` in `illuminateIngress`         | `bun run test:bridge-custody` — verify alone leaves balances unchanged                           |
| Eclipse / peer lie                  | Isolate node                               | Signed hello + peer scoring + headers-first (Gate F lab)                               | Stronger eclipse resistance under adversarial mesh                                               |
| Remote Kindling phish               | Forge presence seal                        | Distinct `partyId` + commitment match                                                  | Simulated optical channel ≠ physical presence                                                    |
| Photo of pay face                   | Steal PIX by photographing lit phone       | Pay face must not encode seed ([`CUSTODY.md`](./CUSTODY.md))                           | Product must ship pay-face ≠ vault; lab maze card still seed-in-light                            |
| Photo / screenshot of vault grid    | Recover Source like a photographed seed    | Vault must not show during public pay; grid is optional representation of code         | Do not teach “screenshot your wallet”                                                            |
| Forgeable verifyLight               | Any-msg accept                             | Removed (fail-closed); use verifyLightFull / verifyPixel                               | Keep weak API out of public surface forever                                                      |

## Non-goals (for now)

- Perfect privacy (ZK) — veils are coarse
- Instant global finality under partitions — `test:wave-partition` is **lab CI** (conflicting wave tips fail accept), not a BFT partition theorem
- Replacing AWS compute — we provide **continuity**, not a universal VM
- Claiming “audited” before an external report lands in [`AUDIT.md`](./AUDIT.md)

## Spatial storage growth (lab note)

Occupied lattice cells grow with tip height (`O(n)` occupancy map / hash-grid buckets). Wave BFS is bounded by `WAVE_MAX_HOPS` and lookback. Sparse occupancy Merkle (`spatialRoot`) commits illuminated cells only. **Control levers (not yet production):** coord-slab sharding, prune dark cells from hot indexes, optional octree after benches. Until Gate F–style published benches, do not claim voxel-scale mainnet storage. See [`SPATIAL.md`](./SPATIAL.md) S4–S5.

## Accepted risks (explicit, not oversights)

| Risk                                                                                                                                                                                                                | Why accepted                                                                                            | Constraint                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@noble/post-quantum` is not constant-time** (PIX-19). The library makes no constant-time claim.                                                                                                                  | Acceptable for browser and server deployments where an attacker is not co-located with the signing key. | Signing keys must not be used in multi-tenant or attacker-co-located environments. Revisit before any hardware/optical signing path ships.                                                                      |
| **On-chain ULA acceptance is a trusted-relayer assertion**, not verification of the Pixel ledger (PIX-12). A relayer re-projects the native ML-DSA attestation onto the keccak twin and signs with an EVM-side key. | Full FIPS-204 verify on EVM is impractical today.                                                       | `ULAVerifier.IS_NATIVE_MLDSA_VERIFY == false`; allowlists are owner-gated and timelocked; consumers must impose a withdrawal delay via `isMatured`. Never describe this as cryptographic verification of Pixel. |
| **Bootstrap ingress has no foreign-chain verifier** unless a `VaultReleasePolicy` supplies one (PIX-09).                                                                                                            | Pilot rails need to run before a verifier exists for every venue.                                       | Hard-fails when `NODE_ENV=production` without a verifier; per-receipt cap; foreign references are consumed once.                                                                                                |

## Trust assumptions

1. Honest majority (or sufficient diversity) of sequencers over time
2. SHA-512 / keccak preimage resistance (as used by OTS / twin)
3. Operators keep seeds offline / OS keystore
4. Mirrors for SISO are actually reachable when origin dies
5. For `ULAOffchainMldsaGate`: submitter actually verified ML-DSA off-chain before commit

If any assumption fails, say so in the client UI — never paper over it.

## Consensus-critical code map (audit pointers)

| Name in docs             | Implementation                              |
| ------------------------ | ------------------------------------------- |
| acceptPixel (historical) | `acceptBlock` in `src/lib/pixel/chain.ts`   |
| OTS single-use           | `usedOtsLeaves` / `assertAndMergeOtsLeaves` |
| Scheme surface           | `signPixel` / `verifyPixel` in `scheme.ts`  |
| ULA twin                 | `contracts/ULAVerifier.sol`                 |
| ULA ML-DSA gate          | `contracts/ULAOffchainMldsaGate.sol`        |

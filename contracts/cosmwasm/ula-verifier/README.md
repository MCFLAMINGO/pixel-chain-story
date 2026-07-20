# CosmWasm twin — ULAVerifier

Second-chain verifier for **PIX-HASH-OTS-128-KECCAK** (same frozen fixture as Foundry).

| Surface | Path |
| --- | --- |
| Algorithm | `src/ots.rs` — byte-parity with `contracts/ULAVerifier.sol` / `src/lib/pixel/ula-evm.ts` |
| Contract | `src/contract.rs` — `SetTrusted` / `Accept` / `LightProofValid` (`--features cosmwasm`) |
| Fixture test | `cargo test` → `tests/fixture.rs` reads `fixtures/ula-evm-v1.json` |

```bash
cargo test
# optional CosmWasm entry compile:
cargo check --features cosmwasm
```

**Honest scope:** MSG_BITS=32 keccak Lamport window for EVM/Cosmos verifiers. Pixel-native ULAs remain SHA-512 OTS / ML-DSA off-chain. Not production bridge security.

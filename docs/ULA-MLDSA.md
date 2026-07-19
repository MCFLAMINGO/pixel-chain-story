# ULA × ML-DSA — honest bridge story

## What ships

| Layer | Scheme | Where |
| --- | --- | --- |
| Pixel-native ULA / PoLS | **PIX-ML-DSA-65** (default) or hash-OTS | `bridge.ts` + `verifyLightProof` → `verifyPixel` |
| EVM / CosmWasm twin | **PIX-HASH-OTS-128-KECCAK** | `ULAVerifier.sol` / CosmWasm — full verify on-chain |
| ML-DSA foreign receipt (lab) | Off-chain ML-DSA verify → on-chain **commit gate** | `ula-mldsa.ts` + `ULAOffchainMldsaGate.sol` |

## Why not full Dilithium verify in Solidity (yet)

FIPS-204 ML-DSA-65 verification is polynomial arithmetic at sizes that are **gas-impractical** as naive pure Solidity in a pilot. Shipping a fake “verify” would be worse than an honest gate.

Lab path instead:

1. **Native:** sequencer signs PoLS / ULA with ML-DSA (already default birth).
2. **Twin:** for Ethereum receipt shape that verifies in-EVM today, re-project to keccak-OTS (`createEvmUlaPackage`).
3. **Gate:** `ULAOffchainMldsaGate` records that a trusted submitter posted `keccak256(pk ‖ messageHash ‖ sig)` **after** off-chain ML-DSA verify in the relayer. This is a **receipt commit**, not on-chain Dilithium.

## Forbidden claims

| Forbidden | Allowed |
| --- | --- |
| “On-chain ULA verifies Dilithium” | “Native ULAs verify ML-DSA off-chain; EVM twin is keccak-OTS; commit gate records PQ receipts” |
| “Quantum-proof bridge” | “PQ-class Pixel birth; foreign twin verifies hash-OTS; ML-DSA gate is lab / trusted-submitter” |

## Tests

```bash
bun run test:ula-mldsa
bun run test:forge   # includes ULAOffchainMldsaGate.t.sol
```

## Next deepen (not this PR)

- zk / precompile path for real on-chain ML-DSA (research)
- Public Sepolia deploy + tx links in `BRIDGE-STATUS.md`
- Drop trusted-submitter assumption when a real verify path exists

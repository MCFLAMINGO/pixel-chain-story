# Bridge status (Gate E)

**Claim unlock (lab):** Universal Light Attestation verify is real on the EVM twin — `ULAVerifier.IS_STUB == false`. CosmWasm twin verifies the same frozen fixture. Relayer path proven on local anvil.

**Custody law:** foreign chain holds receipts only; Pixel holds the vault; foreign verify alone never releases master PIX. Enforced in `illuminateIngress` + `bun run test:bridge-custody`.

**Forbidden claim:** production bridge / mainnet value movement.

---

## Evidence

| Artifact | Status |
| --- | --- |
| Frozen fixture | [`fixtures/ula-evm-v1.json`](../fixtures/ula-evm-v1.json) — `PIX-HASH-OTS-128-KECCAK` |
| Foundry | `forge test` — `ULAVerifier.t.sol` + `ULAOffchainMldsaGate.t.sol` |
| TS parity | `bun run test:ula` |
| ML-DSA ULA path | `bun run test:ula-mldsa` — native verify + twin projection + gate commit |
| CosmWasm twin | `contracts/cosmwasm/ula-verifier` — `cargo test` |
| Relayer (local) | `bun run test:ula-relayer` — anvil `Locked` → `LockFeeder.feed` → shineIn |
| Custody inversion | `bun run test:bridge-custody` — ULA verify alone → Δbalance=0; vault release only via illuminateIngress |

### Scheme honesty

- **EVM / CosmWasm twin:** keccak256 Lamport, `MSG_BITS=32`, 32-leaf Merkle window.
- **Pixel-native ULA:** SHA-512 OTS / **ML-DSA** via `verifyLightProof` (`bridge.ts` + `ula-mldsa.ts`).
- **ML-DSA on-chain:** `ULAOffchainMldsaGate` = off-chain verify + commit (trusted submitter). **Not** full Dilithium in EVM. See [`ULA-MLDSA.md`](./ULA-MLDSA.md).
- Twin exists so foreign VMs never ship a stub `lightProofValid`.

### Public testnet tx links

| Network | Lock / verify tx | Notes |
| --- | --- | --- |
| Ethereum Sepolia (or equiv.) | *pending* | Local anvil proof shipped; public broadcast not yet |

When a public lock + verify pair exists, paste explorer URLs here. Until then do not claim “testnet bridge live.”

---

## Relayer flow

```
PixelUsdcLock.lock  →  event Locked
        ↓
LockFeeder.fromLockedEvent + ethereumLogVerified
        ↓
LockFeeder.feed → illuminateIngress (shineIn) → PIX on pix1…
```

Shine-out (Pixel → foreign): build `createEvmUlaPackage` → foreign `ULAVerifier.accept` / CosmWasm `Accept`.

---

## Commands

```bash
bun run scripts/gen-ula-evm-fixture.ts   # regenerate fixture (do not casually rewrite)
bun run test:ula
bun run test:ula-relayer
forge test
(cd contracts/cosmwasm/ula-verifier && cargo test)
```

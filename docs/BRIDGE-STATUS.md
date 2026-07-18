# Bridge status (Gate E)

**Claim unlock (lab):** Universal Light Attestation verify is real on the EVM twin — `ULAVerifier.IS_STUB == false`. CosmWasm twin verifies the same frozen fixture. Relayer path proven on local anvil.

**Forbidden claim:** production bridge / mainnet value movement.

---

## Evidence

| Artifact | Status |
| --- | --- |
| Frozen fixture | [`fixtures/ula-evm-v1.json`](../fixtures/ula-evm-v1.json) — `PIX-HASH-OTS-128-KECCAK` |
| Foundry | `forge test` — `contracts/test/ULAVerifier.t.sol` (accept / replay / tamper) |
| TS parity | `bun run test:ula` |
| CosmWasm twin | `contracts/cosmwasm/ula-verifier` — `cargo test` |
| Relayer (local) | `bun run test:ula-relayer` — anvil `Locked` → `LockFeeder.feed` → shineIn |

### Scheme honesty

- **EVM / CosmWasm twin:** keccak256 Lamport, `MSG_BITS=32`, 32-leaf Merkle window.
- **Pixel-native ULA:** still SHA-512 OTS / ML-DSA in `bridge.ts` (not replaced by this twin).
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

# Foreign locks & verifiers

Pixel Ledger shines **Universal Light Attestations** outward and accepts **foreign locks** inward.

| File | Role |
| --- | --- |
| `PixelUsdcLock.sol` | Lock USDC for a `pix1…` Personal Source; emit `Locked` for the feeder |
| `MockUSDC.sol` | 6-decimal USDC stand-in for demos / Foundry |
| `ULAVerifier.sol` | Real keccak-OTS verify (`IS_STUB=false`) — EVM twin of Pixel ULA |
| `test/ULAVerifier.t.sol` | Foundry suite against `fixtures/ula-evm-v1.json` |
| `cosmwasm/ula-verifier/` | CosmWasm-shaped second-chain twin (same fixture) |

Off-chain: `src/lib/pixel/ula-evm.ts` (OTS twin) + `lock-feeder.ts` (Locked → shineIn).

See [`docs/BRIDGE-STATUS.md`](../docs/BRIDGE-STATUS.md) and [`docs/LOCK-FEEDER.md`](../docs/LOCK-FEEDER.md).

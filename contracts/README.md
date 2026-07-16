# Foreign locks & verifiers

Pixel Ledger shines **Universal Light Attestations** outward and accepts **foreign locks** inward.

| File | Role |
| --- | --- |
| `PixelUsdcLock.sol` | Lock USDC for a `pix1…` Personal Source; emit `Locked` for the feeder |
| `MockUSDC.sol` | 6-decimal USDC stand-in for demos / Foundry |
| `ULAVerifier.sol` | Shine-out verifier stub (not production crypto) |

Off-chain twin: `src/lib/pixel/lock-feeder.ts` (`LocalUsdcRail` + `BankWireAttestor`) — same receipt pipeline CI executes.

See `docs/LOCK-FEEDER.md`.

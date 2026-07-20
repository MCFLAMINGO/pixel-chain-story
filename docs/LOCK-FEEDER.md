# Lock Feeder — wire dollars in

This is the missing production piece: a **verified foreign lock** before Worldlight credits PIX.

## Paths

| Venue | Lock surface | Receipt |
| --- | --- | --- |
| USDC (Ethereum) | `contracts/PixelUsdcLock.sol` (+ `MockUSDC.sol`) | `Locked` event → `LockReceipt` |
| USDC (CI / local) | `LocalUsdcRail` in `lock-feeder.ts` | same receipt shape |
| Bank wire | `BankWireAttestor` (hash-OTS) | signed wire claim → `LockReceipt` |

## Pipeline

```
lock USDC / attest wire
        ↓
verify LockReceipt (rail or attestor)
        ↓
LockFeeder.feed → PreparedIngress
        ↓
illuminateIngress (bridge escrow → Personal Source)
        ↓
LockFeeder.consume (no double shine-in)
```

## Solidity

```solidity
// approve MockUSDC, then:
PixelUsdcLock.lock(5_000_000, "pix1…", salt); // $5 USDC (6 decimals)
```

Relayer watches `Locked`, builds receipt, calls Pixel `One.LockFeeder.feed`.

## Self-custody

Feeder never holds Pixel seeds. `pixelRecipient` is always a `pix1…` Personal Source.

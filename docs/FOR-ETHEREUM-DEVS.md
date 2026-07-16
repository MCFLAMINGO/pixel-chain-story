# Pixel for Ethereum developers

Pixel is an executable post-quantum UTXO ledger with Proof of Light Sequence.  
**Run it today** — then pick: build on it, harden it, or mirror your existing stack in (SISO).

Full builder map: [`BUILDERS.md`](./BUILDERS.md).

## Why look

- **PQ-class signatures now** — hash-OTS; swap path to ML-DSA behind the same API  
- **Sequencer model you’ll recognize** — PoLS ≈ ordered reveal without hashpower  
- **JSON-RPC** — `pix_protocolInfo`, `pix_verifyChain`, `pix_getBalance`, …  
- **USDC lock surface** — `contracts/PixelUsdcLock.sol` → `One.LockFeeder`  
- **ULA out** — shine attestations to ETH without becoming an L2  
- **SISO** — keep your Solidity/TS app; shine continuity in — no dual product  

## Try in 30 seconds

```bash
bun install
bun run test:all
```

You should see settlement, Kindling, lock feeder, and bootstrap selftests pass.

## Three 1-hour projects

1. **Foundry** — test `PixelUsdcLock` + `MockUSDC`; emit `Locked` → TypeScript receipt  
2. **ULA** — freeze a `createAttestation()` fixture; verify in Solidity (replace stub)  
3. **Mirror** — take any existing dapp frontend; `comeTowardLight` with digest + IPFS mirror  

## Aesthetic is not marketing

Abstract Expressionist framing = rendering thesis: commitment → light → color.  
Maps to pending → inclusion → finality.

## Next hooks for ETH ecosystem

- Restaked sequencer quorums for PoLS committees  
- Blob/DA anchoring of Pixel light proofs on L1  
- AA wallets that show human Kindling receipts (no gas theater)  
- PQ migration lab: OTS → Dilithium/ML-DSA behind the same tx surface  

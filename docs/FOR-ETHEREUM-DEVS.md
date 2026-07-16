# Pixel for Ethereum developers

Pixel is an executable post-quantum UTXO chain with Proof of Light Sequence.
It is designed so you can **run**, **RPC-query**, and **benchmark** it today —
not wait for a whitepaper cycle.

## Why look

- **PQ signatures now** — hash-based OTS; interface-ready for ML-DSA
- **Sequencer model you’ll recognize** — PoLS ≈ PBS without hashpower
- **JSON-RPC** — `pix_protocolInfo`, `pix_verifyChain`, `pix_getBalance`, …
- **Lumen** — domain language where `ghost → shine → collapse` is a state transition
- **Energy** — orders of magnitude below PoW; phone-verifiable proofs

## Try in 30 seconds

```bash
bun run test:pixel
```

You should see a Lumen `send` ray move 777 PIX, RPC methods succeed, and a
benchmark table with real `performance.now()` timings.

## Aesthetic is not marketing

The Abstract Expressionist framing is a **rendering thesis**: information
transfers as chromatic field events through void. Light reveals proximity;
without light, color is absent. That maps cleanly onto commitment → revelation
→ finality — the same arc as pending → inclusion → finalized.

## Next hooks for ETH ecosystem

- Restaked sequencer quorums (Eigen-style) for PoLS committees
- Blob/DA anchoring of Pixel light proofs onto L1 Ethereum
- Account-abstraction wallets that display human-readable revelation receipts
- PQ migration lab: swap PIX-HASH-OTS for Dilithium behind the same tx ABI

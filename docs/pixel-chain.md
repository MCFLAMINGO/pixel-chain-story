# Pixel — Light Protocol Blockchain

Pixel is a Bitcoin-like, quantum-resistant Layer 1 where **light is the backbone** of consensus, keys, and verification — not a visual gimmick. Transfers are real UTXO movements with final balances. Looking at the ledger paints a picture of pixels; each block is one pixel in that image.

## Do you need a new coding language?

**No.** You need a new *protocol*, built with ordinary TypeScript (and later Rust for production nodes).

| Everyday idea | Protocol reality |
|---|---|
| Something is both true and false until light reveals it | Transaction **commitment** in *superposition* until PoLS revelation |
| Phone screen shines a picture that holds the key | **Optical encoding** — luminance grid embeds key bytes |
| Flashlight / camera / two screens together | Capture + decode the optical pattern (analog bridge) |
| Save energy vs Bitcoin mining | **Proof of Light Sequence** — one signature per block, no hash grinding |
| Humanity-first ledger | Human-readable metadata signed into every transfer |

## Core properties

1. **Real transactions** — UTXO model; amounts move; balances update; double-spends rejected.
2. **Quantum-resistant signatures** — hash-based one-time signatures (SHA-512 Lamport-style). Crypto-agile: swap for NIST ML-DSA / SLH-DSA later without changing the tx format.
3. **Proof of Light Sequence (PoLS)** — sequencers rotate deterministically; each block carries a light proof (beacon + signature). Far cheaper than Proof of Work.
4. **Optical / analog channel** — screen-projected patterns carry key material; camera or a second screen can read them back.
5. **Pixel ledger** — block colors are hash-derived; the chain *is* a picture; tampering breaks both the math and the image.

## Lifecycle of a transfer

1. **Propose** — wallet builds a UTXO tx with readable metadata (`description`, `reference`). State = `superposition`.
2. **Sign** — hash-based light signature covers commitment + body.
3. **Sequence (shine light)** — elected sequencer publishes a PoLS light proof; tx collapses to `final`.
4. **Verify** — any phone checks signatures, sequence, merkle root, and pixel colors.

## Code map

| Path | Role |
|---|---|
| `src/lib/pixel/crypto.ts` | SHA-512, addresses, hash-based OTS |
| `src/lib/pixel/optical.ts` | Screen-light encode / camera decode |
| `src/lib/pixel/transaction.ts` | UTXO txs, readable metadata, reveal |
| `src/lib/pixel/pol.ts` | Proof of Light Sequence |
| `src/lib/pixel/chain.ts` | Chain, balances, sequencing, verify |
| `scripts/pixel-selftest.ts` | End-to-end real transfer test |

## Run the self-test

```bash
bun scripts/pixel-selftest.ts
```

## What this MVP is / is not

**Is:** a working single-node protocol demo with real balance updates, quantum-resistant hash signatures, optical key projection, and energy-light consensus.

**Is not yet:** a multi-peer network, production NIST PQC (Dilithium) wiring, ZK privacy pool, or app-store mobile release. Those layer on the same interfaces.

## Design principle

> If a computer had a mind of its own, it could shine light from its screen — and the picture that was projected could hold the key.

That is not poetry layered on fake tech. It is an optical byte channel plus a revelation consensus. Performance theater is optional; settlement is mandatory.

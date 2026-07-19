# Quantum security — first-class requirement

Pixel must remain useful when large quantum computers break ECDSA/Ed25519.  
This is not a marketing adjective. It is a **hard design constraint**.

## What ships today

| Scheme | Standard | Use | Status |
| --- | --- | --- | --- |
| **PIX-ML-DSA-65** | NIST **FIPS-204** ML-DSA (Dilithium) via `@noble/post-quantum` | **Default** genesis / wallets / sequencers | Shipped + CI + frozen vectors |
| **PIX-HASH-OTS-128** | Hash-based Lamport + Merkle window (32 leaves) | Constrained / optical / ceremony | Shipped + CI + frozen vectors + ledger single-use |
| **PIX-ML-KEM-768** | NIST **FIPS-203** ML-KEM (Kyber) + XChaCha20-Poly1305 | Lab transport sessions | Shipped in `transport-kem.ts`; **mesh default still plaintext** |

**Classical ECC is not used for Pixel signatures.**

Both signature schemes sign through one surface: `signPixel` / `verifyPixel` (`src/lib/pixel/scheme.ts`).

```ts
import { generatePixelKeypair, signPixel, verifyPixel } from "./src/lib/pixel";

// Gate D: default birth is ML-DSA
const kp = await generatePixelKeypair();
const sig = await signPixel("hello", kp);
await verifyPixel("hello", sig, kp.publicKey); // true
```

| Env | Effect |
| --- | --- |
| *(unset)* | `PIX-ML-DSA-65` |
| `PIXEL_SIG_SCHEME=PIX-HASH-OTS-128` | opt into OTS for new keys |
| `PIXEL_SIG_SCHEME=PIX-ML-DSA-65` | explicit ML-DSA |

## Frozen vectors (Gate D evidence)

[`src/lib/pixel/vectors/quantum-v1.json`](../src/lib/pixel/vectors/quantum-v1.json) — deterministic seeds + signatures.  
CI: `bun run test:vectors` must stay green. Do not edit casually.

## Honest claims

| Allowed | Forbidden until evidence |
| --- | --- |
| “PQ-class signatures (NIST ML-DSA-65 default + hash-OTS)” | “Quantum-proof forever / audited production crypto” |
| “No ECDSA dependency for Pixel tx/PoLS” | “On-chain ULA verifies Dilithium” (EVM twin is keccak-OTS; gate is off-chain verify + commit) |
| “OTS leaves cannot be reused (ledger + wallet)” | “Optical path is PQ-complete custody UX” |
| “Lab ML-KEM-768 session crypto available” | “Gossip/RPC is PQ-encrypted by default” |
| “Scoped audit package prepared” | “Audited” (see [`AUDIT.md`](./AUDIT.md) — PREPARING) |

`quantumStatus()` and `pix_protocolInfo.quantum` expose this to clients.

## Threat model (quantum)

1. **Shor** breaks RSA/ECC → we never depended on them for Pixel sigs.
2. **Grover** weakens hashes → SHA-512 + 128-bit OTS digest is the lab choice; monitor.
3. **Leaf reuse** destroys Lamport → wallet `OTS_EXHAUSTED` + ledger `usedOtsLeaves` / `OTS_LEAF_REUSED` (`bun run test:ots-reuse`).
4. **Harvest-now-decrypt-later** on encrypted channels → lab `bun run test:kem`; wire not default-on.

## Bridge × ML-DSA

See [`ULA-MLDSA.md`](./ULA-MLDSA.md): native ULA under ML-DSA sequencers; EVM twin remains keccak-OTS; `ULAOffchainMldsaGate` records PQ commits after off-chain verify.

## Path gates

- **Gate D:** ML-DSA default ✓ · frozen vectors ✓ · persist `scheme` / secret / `nextLeaf` ✓  
- **Gate E:** keccak-OTS twin ✓ · native ML-DSA ULA ✓ · off-chain commit gate ✓ · full on-chain Dilithium open  
- **Gate I:** audit package PREPARING ✓ · external report open  

See [`PATH.md`](./PATH.md). Quantum remains **critical** — keep claims at evidence level.

## Why both OTS and ML-DSA

- **ML-DSA** — NIST standard, multi-use, **normal birth of a node**.  
- **OTS** — small verify story, hash-only assumption, fits optical/maze cards; one-time discipline.

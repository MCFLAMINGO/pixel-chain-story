# Quantum security — first-class requirement

Pixel must remain useful when large quantum computers break ECDSA/Ed25519.  
This is not a marketing adjective. It is a **hard design constraint**.

## What ships today

| Scheme | Standard | Use | Status |
| --- | --- | --- | --- |
| **PIX-HASH-OTS-128** | Hash-based Lamport + Merkle window (32 leaves) | Constrained / optical / lab default | Shipped + CI |
| **PIX-ML-DSA-65** | NIST **FIPS-204** ML-DSA (Dilithium) via `@noble/post-quantum` | Multi-use wallets & sequencers | Shipped + CI |

**Classical ECC is not used for Pixel signatures.**

Both schemes sign through one surface: `signPixel` / `verifyPixel` (`src/lib/pixel/scheme.ts`).

```ts
import { generatePixelKeypair, signPixel, verifyPixel } from "./src/lib/pixel";

const kp = await generatePixelKeypair("PIX-ML-DSA-65");
const sig = await signPixel("hello", kp);
await verifyPixel("hello", sig, kp.publicKey); // true
```

Env default override: `PIXEL_SIG_SCHEME=PIX-ML-DSA-65`.

## Honest claims

| Allowed | Forbidden until evidence |
| --- | --- |
| “PQ-class signatures (hash-OTS + NIST ML-DSA-65)” | “Quantum-proof forever / audited production crypto” |
| “No ECDSA dependency for Pixel tx/PoLS” | “On-chain ULA verifies Dilithium” (EVM twin is keccak-OTS today; ML-DSA on-chain later) |
| “OTS leaves cannot be reused” | “Optical path is PQ-complete custody UX” |

`quantumStatus()` and `pix_protocolInfo.quantum` expose this to clients.

## Threat model (quantum)

1. **Shor** breaks RSA/ECC → we never depended on them for Pixel sigs.  
2. **Grover** weakens hashes → SHA-512 + 128-bit OTS digest is the lab choice; monitor.  
3. **Leaf reuse** destroys Lamport → enforced (`OTS_EXHAUSTED`).  
4. **Harvest-now-decrypt-later** on encrypted channels → separate from ledger sigs; prefer PQ KEMs for transport later (ML-KEM).

## Path gates

- **Gate D (priority):** ML-DSA shipped in-process ✓ — remaining: default wallets to ML-DSA when ready, CI vectors freeze, wallet persist `scheme`  
- **Gate E:** foreign verifier verifies real sigs (keccak-OTS twin shipped; ML-DSA on-chain optional later)  
- **Gate I:** external audit of OTS + noble ML-DSA integration  

See [`PATH.md`](./PATH.md). Quantum is **critical priority** — network flake-fixes (Gate B) run in parallel, not ahead of PQ hardening.

## Why both OTS and ML-DSA

- **OTS** — small verify story, hash-only assumption, fits optical/maze cards; one-time discipline.  
- **ML-DSA** — NIST standard, multi-use, right default for sequencers and phones that sign often.

Production regime target: **ML-DSA-65 default**, OTS retained for constrained / ceremony paths.

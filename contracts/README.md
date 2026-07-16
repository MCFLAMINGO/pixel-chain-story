# Foreign verifiers

Pixel Ledger shines **Universal Light Attestations** outward.  
Other chains only verify — they never execute Pixel’s VM.

| File | Status |
| --- | --- |
| `ULAVerifier.sol` | Interface + wiring stub (not production crypto) |

Next: fixture vectors from `createAttestation()` consumed by Foundry/Hardhat tests, then a real ML-DSA or hash-OTS verifier library.

# Audit package — Gate I (preparing)

**Status:** `PREPARING` — scoped self-review package ready; **external audit not yet commissioned**.  
**Do not claim:** “Audited,” “production crypto,” or “trusted L1.”

Frozen with: [`THREAT-MODEL.md`](./THREAT-MODEL.md) **v1.1** · evidence dates via CI scripts below.

## Scope (in)

| Surface | Path | Why |
| --- | --- | --- |
| Hash-OTS + leaf single-use | `src/lib/pixel/crypto.ts`, `chain.ts` (`usedOtsLeaves`) | Spend / PoLS forgery if broken |
| ML-DSA-65 scheme surface | `src/lib/pixel/scheme.ts` (`signPixel` / `verifyPixel`) | Default wallet / node birth |
| Frozen quantum vectors | `src/lib/pixel/vectors/quantum-v1.json` | Drift / regression |
| Tip accept path | `acceptBlock` in `src/lib/pixel/chain.ts` (docs historically said `acceptPixel`) | Peer can poison tip |
| ULA EVM twin | `contracts/ULAVerifier.sol`, `src/lib/pixel/ula-evm.ts` | Foreign receipt forgery |
| ULA ML-DSA off-chain + gate | `src/lib/pixel/ula-mldsa.ts`, `contracts/ULAOffchainMldsaGate.sol` | PQ birth ↔ foreign receipt story |
| Bridge custody inversion | `bridge-custody.ts` | Foreign verify ≠ vault release |

## Scope (out — for this package)

- Full BFT / ≥7 operator live set (Gate G)
- Public testnet bridge links (Gate E remainder)
- Gossip/RPC default plaintext (ML-KEM is lab-optional; see `transport-kem.ts`)
- Continuity merchant UX / DNS automation
- ZK / full on-chain Dilithium verify (gas-impractical; see [`ULA-MLDSA.md`](./ULA-MLDSA.md))

## Evidence commands (must stay green)

```bash
bun run test:crypto
bun run test:ots-reuse
bun run test:mldsa
bun run test:vectors
bun run test:ula
bun run test:ula-mldsa
bun run test:bridge-custody
bun run test:light
bun run test:audit-scope
bun run test:forge   # needs foundry
```

## Self-review checklist (lab)

- [x] Threat model frozen (v1.1) with quantum + eclipse notes updated
- [x] Default scheme is ML-DSA-65; OTS retained + ledger single-use
- [x] `ULAVerifier.IS_STUB == false` (keccak-OTS twin)
- [x] ML-DSA native ULA verify path + honest off-chain gate contract
- [x] Weak `verifyLight` remains fail-closed
- [ ] External firm engaged — **open**
- [ ] Criticals from external report fixed — **open**
- [ ] Report link published here — **open**

## Claim unlock (only after external report + fixes)

_“Audited components (scoped).”_ Until then the honest line is:

> **Scoped audit package prepared; external review pending.**

## Engagement notes (for a future auditor)

1. Prefer review of `@noble/post-quantum` **integration** (domain separation, key persistence, OTS cursor) over re-auditing NIST algorithms from scratch.
2. `acceptBlock` + OTS reuse set + electable-bound PoLS are consensus-critical.
3. ULA: distinguish **keccak-OTS on-chain twin** from **ML-DSA off-chain + commit gate** — do not conflate.
4. Transport ML-KEM is out of ledger safety scope unless gossip encryption is enabled in production.

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
bun run test:adversarial   # every audit scenario must be REJECTED
bun run test:invariants    # monetary properties over random histories
```

## Pre-audit hardening pass (2026-08)

An AI reviewer in the external-reviewer role produced
[`audit/EXTERNAL-AUDIT-GATE-I.json`](./audit/EXTERNAL-AUDIT-GATE-I.json):
22 findings, 7 critical, 11 confirmed by working exploit.

**This is not the external report and its URL must not be pasted below.** Its own
`independence_caveat` says so. It is recorded here because the finding IDs are
referenced from commit messages and tests, and because the honest history of
this package includes the fact that nine green evidence commands coexisted with
eleven successful exploits.

| Finding | Fix | Regression test |
| --- | --- | --- |
| PIX-01 owner binding | `verifyTransactionSignaturesForOwners` in every consensus path | `test:adversarial`, `test:invariants` |
| PIX-02 coinbase / cap | `validateAndApplyBlockTxs` | `test:adversarial`, `test:invariants` |
| PIX-03 input existence / conservation | `applySpendTx` | `test:adversarial`, `test:invariants` |
| PIX-04 electable bypass | `derivedElectable` + monotonic check | `test:adversarial` |
| PIX-05 blind `verifyChain` | full UTXO replay | `test:adversarial` |
| PIX-06 unsigned bridge message | `bridgePayload` + inclusion proof | `test:adversarial` |
| PIX-07 self-authorizing gate | required `trustedSequencers` | `test:adversarial` |
| PIX-08 truncated commit digest | `gateMessageHash32` | `test:adversarial` |
| PIX-09 unverified vault release | `VaultReleasePolicy` + `consumeVaultRelease` | `test:adversarial` |
| PIX-10 OTS strength | 256-bit digest, 32-byte halves | `test:vectors`, `test:adversarial` |
| PIX-11 fail-open cursor | required cursor + `OTS_CURSOR_UNKNOWN` | `test:adversarial` |
| PIX-12 on-chain OTS forgeable | `MSG_BITS=256`, rebuilt message, leaf tracking | `forge test`, `cargo test` |
| PIX-13 no access control | owner + timelocked allowlists | `forge test` |
| PIX-14 unbounded timestamps | parent anchor + drift bound | `test:adversarial` |
| PIX-15 reorg released leaves | append-only used-leaf set | `test:adversarial` |
| PIX-16 domain separation | OTS tag + native ML-DSA ctx | `test:adversarial` |
| PIX-17 unmet noble dependency | `@noble/ciphers` ^2.2.0 | `bun install` |
| PIX-18 deterministic signing | hedged by default | `test:adversarial` |
| PIX-19 constant-time risk | recorded in `THREAT-MODEL.md` | n/a (accepted) |
| PIX-20 leaf index bounds | explicit assertions + schema | `test:adversarial` |
| PIX-21 no negative tests | `test:adversarial` + `test:invariants` in CI | this row |
| PIX-22 docs claimed unimplemented checks | inclusion proof implemented; labels corrected | `forge test` |

## Self-review checklist (lab)

- [x] Threat model frozen (v1.1) with quantum + eclipse notes updated
- [x] Default scheme is ML-DSA-65; OTS retained + ledger single-use
- [x] `ULAVerifier.IS_STUB == false` (keccak-OTS twin)
- [x] ML-DSA native ULA verify path + honest off-chain gate contract
- [x] Weak `verifyLight` remains fail-closed
- [x] Pre-audit pass fixed; adversarial + invariant suites gate CI (PIX-21)
- [x] On-chain acceptance labelled as relayer trust, not verification (PIX-12/22)
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

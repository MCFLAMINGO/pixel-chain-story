# Audit checklist — code checks ↔ gates / quantum

Companion to [`AUDIT.md`](./AUDIT.md) (Gate I package status) and [`QUANTUM.md`](./QUANTUM.md).  
**Honest line:** scoped self-review + this checklist — not “audited L1.”

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
bun run test:lumen
bun scripts/bench-light-client.ts   # lab numbers, not a claim
bun run test:forge                  # needs foundry
```

---

## Prioritized hardening (from static review)

### Critical — before public relay / RPC exposure

| Item | Where | Status |
| --- | --- | --- |
| Input size / schema limits on untrusted JSON (signatures, attestations) | `parseOtsLeafIndex`, `verifyLightFull`, `buildMldsaGateReceipt`, RPC `JSON.parse` | [ ] |
| OTS reuse enforced at **every** external accept path | `collectOtsUsages` / `assertAndMergeOtsLeaves` on `acceptBlock` / `sequenceBlock` / RPC | [~] ledger path; verify all RPC/gossip entry points |
| Canonical serialization for ML-DSA / signature commits | `mldsaGateCommit`, `sigHash` (`ula-mldsa.ts`) — hex-lowercase, no whitespace | [ ] document + enforce |

### High

| Item | Where | Status |
| --- | --- | --- |
| Heavy serial `await` hashing in hot loops | `leafMaterial`, `merkleRootFromLeaves`, `generateLightKeypair`, `computeStateRoot` | [ ] parallelize / `@noble/hashes` sync in hot paths |
| Hex input validation + lowercase canonicalize | `hexToBytes`, `addressFromPublicKey` | [ ] |
| Structured verify diagnostics (no secrets) | `verifyLightFull`, `verifyEvmOts` swallow → `false` | [ ] audit/dev log mode |

### Medium

| Item | Where | Status |
| --- | --- | --- |
| Cache merkle layers during block construction | `merkleRootFromLeaves`, auth paths | [ ] |
| EVM truncations match Solidity fixtures | `ula-evm.ts` ↔ `contracts/test` | [~] keep green with `test:forge` |
| Mutex around node sequence / gossip / RPC mutations | `PixelLedgerNode` | [ ] |

### Low

| Item | Status |
| --- | --- |
| `bytesToHex` micro-opt / lookup table | [ ] |
| Constant-time compare for any secret equality | [ ] (public digests OK with `===`) |

---

## Mapping to gates / quantum

| Gate / badge | Checklist focus |
| --- | --- |
| **Gate B** (join/node) | `verifyChain` deterministic; `usedOtsLeaves` rebuild on join; merkle parity |
| **Gate C** (skip/stall) | `POLS_STALL_MS` + skipCount bound into message; skew tests |
| **Gate F** (light client) | `computeStateRoot` / headers / balance proofs; absence proofs; bench baseline |
| **Gate I** (audit package) | This file + [`AUDIT.md`](./AUDIT.md) evidence commands green; external firm still open |
| **Quantum** | Parameters in [`QUANTUM.md`](./QUANTUM.md): OTS window, ML-DSA-65 default, truncations, domain separation |

---

## Recommended small PRs (order)

1. **RPC / attestation zod (or hand schema) + size caps** before `JSON.parse`
2. **Harden `hexToBytes`** — `/^[0-9a-fA-F]+$/`, even length, lowercase before hash
3. **Parallelize independent hashes** in leaf/merkle builders (`Promise.all` or sync noble)
4. **Memoize merkle layers** for authPath during block build
5. **Mutex / queue** on `PixelLedgerNode` critical transitions
6. **CI bench job** — `bun scripts/bench-light-client.ts` + recorded baseline (no flaky hard fail until stable)

---

## Lab tools added for audit / perf

| Artifact | Run |
| --- | --- |
| Minimal Lumen REPL | `bun src/lumen/repl.ts src/lumen/example.lumen` |
| Lumen selftest (product + REPL) | `bun run test:lumen` |
| Light-client micro-bench | `bun scripts/bench-light-client.ts` |

Claim unlock still requires external report + fixes per [`AUDIT.md`](./AUDIT.md).

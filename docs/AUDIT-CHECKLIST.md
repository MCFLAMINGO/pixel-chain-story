# Audit checklist for Pixel Ledger

This checklist maps code/behavior checks to the repo claims (pix_protocolInfo.gates / .quantum) and documents recommended changes per docs/AUDIT.md.

1) Crypto correctness and safe defaults
- [ ] All uses of one-time signatures enforce non-reuse: verify collectOtsUsages + assertAndMergeOtsLeaves are used everywhere that finalizes transactions and accepts blocks.
- [ ] Ensure parseOtsLeafIndex rejects malformed envelopes; add strict schema validation for signature JSON in all entry points.
- [ ] Replace any deprecated verifyLight stub usage. Remove or fail-fast if imported accidentally.
- [ ] Prefer constant-time comparisons for sensitive byte comparisons where applicable; avoid string equality where timing attacks could matter.

2) PQ / ML-DSA handling
- [ ] Ensure ML-DSA keys are generated with sufficient entropy and secretKey not exposed in logs.
- [ ] Audit mldsaGateCommit formation: canonicalize messageHash and signature formats before hashing.
- [ ] Ensure EVM twin truncations match on-chain verifier expectations (bytes16 truncation in ula-evm.ts).

3) Input validation and hardening
- [ ] All external inputs (RPC / HTTP endpoints) must validate JSON envelopes before passing to verify functions (e.g., att.lightProof.signature). Add zod or similar validation layers.
- [ ] Validate addresses via assertPixelAddress at RPC boundaries.
- [ ] Sanitize numbers (sequence, indices) to be integers and within allowed ranges.

4) Concurrency and state mutation
- [ ] Node persistence (saveChain/saveWallet) must use atomic writes and fsync where appropriate; ensure file writes are robust to crashes.
- [ ] Guard state mutation (usedOtsLeaves, utxos, pending) when multiple async tasks run (gossip + RPC + sequencing). Add a simple mutex or queue in PixelLedgerNode around critical state transitions.

5) Determinism and canonical encoding
- [ ] Canonical string encodings used for merkle / block hashing should be documented and tested for cross-platform parity (endian, text encoding). Add property tests comparing implementations.

6) Testing and fuzz coverage
- [ ] Add fuzz/test cases for OTS edge cases: leafIndex boundary, corrupt authPath, reused leaf in same tx batch.
- [ ] Add CI job running selftests with varied random seeds to catch nondeterminism.

7) Performance & resource limits
- [ ] Add limits on pending txs size per node to prevent OOM from malicious feed.
- [ ] Benchmark heavy paths (computeStateRoot, verifyHeaderChain, merkleRoot) and document targets.

Mapping to gates / quantum badges
- Gate B (local join/node): verifyChain must pass all checks; ensure usedOtsLeaves rebuilding is enforced on join.
- Gate C (skip/stall): timestamp and POLS_STALL_MS checks must be enforced and tested under wall-clock skew.
- Gate F (light client): computeStateRoot and header sync must be optimized and audited; ensure light proofs cannot be replayed with mismatched stateRoot.
- Quantum: ensure docs/QUANTUM.md recommendations (hash-OTS + ML-DSA-65) are reflected in code paths and that cryptographic parameters are explicit (hash truncation lengths, seed lengths).

Recommended immediate code changes (small PRs)
- Add strong JSON schema validation (zod) to bridge input/attestation parsing.
- Fail fast on deprecated verifyLight imports; add linter rule detecting deprecated export usage.
- Add lightweight mutex around PixelLedgerNode.sequence and gossip handlers.
- Add benchmark script (this commit) to CI and include perf target thresholds in docs/AUDIT.md.


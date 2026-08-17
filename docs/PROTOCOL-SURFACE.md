# Protocol surface — what is consensus, and what is not

This is the document to open first.

Pixel has 85 modules under `src/lib/pixel`. **Nineteen of them are the protocol.** The
rest are wallets, bridges, UI feeds, operator tooling, and models — some of it good work,
none of it consensus. Until this file existed there was no way to tell which was which
without reading the import graph, and the honest consequence is that careful readers
discounted the real ledger because it was buried in things that only sounded like one.

Classification is enforced, not asserted: `scripts/audit-scope-selftest.ts` fails the
build if a module is added without a classification, or if a consensus module imports a
model.

## Consensus — changing these changes what a valid chain is

These nineteen are reachable from `acceptBlock`, `verifyChain` or `sequenceBlock`. A bug
here is a bug in the ledger.

| Module               | What it decides                                                 |
| -------------------- | --------------------------------------------------------------- |
| `chain.ts`           | Block acceptance, replay, UTXO application, the monetary gate   |
| `pol.ts`             | Leader lottery, light proofs, merkle roots, proof/block binding |
| `transaction.ts`     | Transaction identity, canonical body, signature verification    |
| `membership.ts`      | Who may produce a pixel — the fold over committed records       |
| `sig-era.ts`         | Which signature rules apply at which height                     |
| `legacy-sig.ts`      | The pre-`c8d5d54` constructions, verification only              |
| `economics.ts`       | Emission schedule, hard cap, issuance arithmetic                |
| `limits.ts`          | Block and metadata bounds; the paging helper                    |
| `crypto.ts`          | SHA-512, hash-OTS, key derivation, OTS leaf accounting          |
| `scheme.ts`          | Scheme dispatch, address derivation, ML-DSA signing/verifying   |
| `light-digest.ts`    | Domain-separated digests used by transaction identity           |
| `light-color.ts`     | Colour composition — recomputed and compared on accept          |
| `field-witness.ts`   | Sphere lock witnesses and digest — recomputed on accept         |
| `wave.ts`            | Lead-wave hits and digest — recomputed on accept                |
| `spatial-picture.ts` | Sparse occupancy Merkle root — recomputed on accept             |
| `optical.ts`         | The PoLS beacon                                                 |
| `gift-and-record.ts` | Gift/record rules, when the network enables them                |
| `sovereignty.ts`     | Provider diversity assertion on registry updates                |
| `crowned-genesis.ts` | Which genesis and network id is the crowned Earth               |

Two more are consensus-adjacent and worth naming: `mempool.ts` decides what a node will
hold and relay, and `wire-schema.ts` decides what it will parse. Neither changes block
validity, but both are the door an attacker knocks on.

## Models — reasoning, measurement and argument. Not rules.

**Nothing here is enforced by anything.** These modules compute figures, explore designs
and make arguments. They are kept because the reasoning is worth keeping — the farm
analysis in `presence-peg.ts` is why per-pair minting was not shipped — but a rule that
lives here does not exist.

If something in this list ever needs to bind, it must move into the accept path. That is
the whole distinction, and `audit-scope-selftest.ts` enforces the boundary: no consensus
module may import from this set.

| Module              | What it argues                                                  |
| ------------------- | --------------------------------------------------------------- |
| `presence-peg.ts`   | Population-pegged supply, and the farm economics that killed it |
| `economy-model.ts`  | Circulation and till modelling                                  |
| `mint-harm.ts`      | What a mint-back would cost and who it would harm               |
| `energy-truth.ts`   | Energy accounting versus proof-of-work                          |
| `farm-signature.ts` | What a device farm looks like in the data                       |
| `lit-supply.ts`     | Supply measured by living participation                         |
| `end-state.ts`      | Where the picture ends: one record per person                   |
| `uptake.ts`         | Adoption modelling                                              |
| `expression.ts`     | Expressive capacity of the picture                              |
| `interactions.ts`   | Interaction taxonomy                                            |
| `provenance.ts`     | Who lit what, for the UI                                        |

## Everything else

Wallets (`people-wallet*`, `custody`), bridges and anchoring (`bridge*`, `anchor*`,
`ula-*`, `eth-usdc-lock`, `lock-*`), Continuity (`continuity-*`, `siso`), optical
(`optical-capture`, `pay-*`), node infrastructure (`peer-score`, `transport-kem`,
`rate-limit`, `light-client`, `chain-mirror*`), and UI feeds (`lattice`, `spatial-sink`,
`wave-bus`, `firefly`, `tip-mark`, `spatial-index`, `wave-rules`).

Real, useful, and not the ledger. A bug in any of them is a bug in a product surface, not
in what a valid chain is.

## Field-level detail

`scripts/coverage-harness-selftest.ts` holds the field-by-field registry: every field of
`LedgerPixel`, `LightProof`, `Transaction` and `SequencerRecord`, how it is bound, and
why that binding is sufficient. It fails the build when a consensus type grows a field
nothing accounts for, and it mutation-tests each one to prove the binding is real rather
than merely claimed.

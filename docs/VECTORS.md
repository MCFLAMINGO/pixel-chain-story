# Test vectors — what a second implementation is built against

`fixtures/vectors/protocol-v1.json`

## Why this file is the important one

"As robust as Ethereum" rests on something unglamorous: a specification precise enough
that somebody can write a second client without reading the first one, and vectors precise
enough to tell them when they have it wrong.

Pixel has one TypeScript implementation. Until there is a second, _the protocol_ and _what
this code does_ are the same sentence, and no amount of internal testing can pull them
apart — a bug that is consistent with itself passes every test in this repository.

[`SPEC.md`](./SPEC.md) §2.1 pins the constants and `test:spec-conformance` checks them.
This pins the **bytes**.

## The thing these vectors do that a digest list does not

They record the **exact string preimages**, not only the resulting hashes.

That is deliberate, because every silent divergence this project has actually suffered was
a preimage disagreement rather than a hash disagreement:

- Commit `c8d5d54` moved ML-DSA domain separation out of the message and into the FIPS-204
  `ctx` parameter. Correct change; no migration. Thirteen pixels stopped verifying and
  nobody noticed for weeks, because nothing re-verifies stored history.
- A zod schema rebuilt transaction objects in schema-declaration order, which changed the
  JSON, which changed the signed bytes. Multi-node sync broke instantly — and that one was
  _lucky_: it failed loudly and immediately.

An implementation that produces the right digest from the wrong preimage agrees today and
forks later, on a case nobody thought to test. So the vectors give you the input string,
the recipe, and the output.

## Sections

| Section               | What it pins                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `digests`             | `sha512Hex`, and the domain-separated `lightDigest` forms                                                        |
| `addresses`           | address derivation, which is _per scheme_ — the same key bytes under a different scheme give a different address |
| `transactionIdentity` | `canonicalTxBody` (the exact JSON), the commitment, the txid, and the signed message                             |
| `merkle`              | root over three leaves, the empty and single-leaf cases, and an inclusion proof                                  |
| `pols`                | lottery preimage and score, electable commitment, beacon, and `polsMessage` in three shapes                      |
| `membership`          | the claim string, both signing messages, a complete signed join record, and the fold at five heights             |
| `emission`            | reward and cumulative issuance at boundary indices                                                               |
| `eras`                | which signature rules apply at which height, on which network                                                    |
| `block`               | a complete valid pixel, its parent, and every digest recomputed                                                  |

## Details worth reading before you implement

**Key order in `canonicalTxBody` is significant.** It is `inputs`, `outputs`, `metadata`,
`timestamp`. Inputs are reduced to `{ txid, vout }` — signatures and public keys are _not_
in the body. Serializing these in another order produces a different txid and a chain that
forks on its first transaction.

**`privacy` and `state` are not in the signed body.** `privacy` is nonetheless
consensus-bound, because it feeds colour composition and the block colour is recomputed on
accept. If you are looking for the place it is checked, it is there and not in the
signature.

**The optional PoLS segments are the compatibility mechanism.** `el=` and `members=` appear
in the signed message _only_ when their inputs are present. A pixel that changes no
membership signs exactly the message it would have signed before membership existed — which
is why all 47 pixels of the crowned chain still verify after that field was added. Emitting
an empty segment would fork the chain.

**Possession and authorization sign different messages over the same claim.** Different
domain prefixes, so neither signature can stand in for the other. An earlier version of
`sequencerRecordProblem` verified only possession and simply checked that the authorizer's
address appeared in the active set, which meant copying the possession signature into the
authorization field produced a valid record. A membership selftest caught it on the first
run.

**The vector chain is deliberately not on network 20553.** On the crowned network every
pixel below `LEGACY_SIG_ERA_END_HEIGHT` must verify under the _pre_-`c8d5d54` constructions,
and these blocks are freshly signed under the current ones. Claiming the crowned id would
have baked that contradiction into the artifact. See §4.4 of the spec.

**`revealedAt` is normalized to 0.** It is a display timestamp outside `canonicalTxBody`, so
it affects no digest and no signature — the coverage harness classifies it `public`. Your
implementation may emit whatever it likes there and still agree on every hash.

## Using them

```bash
bun run test:protocol-vectors   # verify the committed file still matches the code
bun run vectors:write           # regenerate — only when the protocol legitimately changes
```

The check is a **byte comparison** of regeneration against the committed file, which catches
drift in both directions at once:

- code drifts from the vectors → a released implementation just changed its wire format
- vectors drift from the code → somebody regenerated them to make a failure go away, which
  is how a known-answer test stops answering anything

There is a real cost to that strictness: any legitimate protocol change needs
`vectors:write` in the same commit, with the change named in the message. That is the point.
A change to a preimage should be impossible to make quietly.

## Verifying the live chain yourself

Separate from the vectors, and the other half of the same idea:

```bash
bun run verify:crowned              # against the live public tip
bun run verify:crowned -- --fixture # against the committed snapshot, offline
```

It replays every pixel, recomputes the UTXO set and total supply independently of the
verifier, and then reads the anchor contracts directly by `eth_call` — so the tip digest is
confirmed by public chains this project does not control. It exits non-zero and says what
failed, because a verifier whose failure looks like success is worse than no verifier. If no
anchor venue is reachable it says so explicitly rather than implying the check passed.

## If you are writing the second implementation

Start at `transactionIdentity` and `pols` — those two sections are where an independent
implementation diverges, and they are cheap to check. `merkle` and `digests` are the
primitives underneath them. Then `membership` and `eras`, which are rules rather than
formats. Leave `block` for last: if you can accept that pixel and verify the two-pixel
chain, you have the acceptance rule, and everything else was a prerequisite.

### Implementer checklist (verify-only first)

A verify-only client already unlocks “many implementations” for **readable forever**
([`DURABILITY.md`](./DURABILITY.md)). Produce, then gossip, can wait.

1. Parse `fixtures/crowned-47.json` (or `/sync` pixels) into your pixel type.
2. Recompute every `txid` / merkle root / light-proof binding from `protocol-v1.json` recipes.
3. Implement era-aware signature verify (`eras` section + `docs/QUANTUM.md`).
4. Fold membership records the way `membership` vectors show — electable at height H.
5. Accept the `block` vector pixel; reject the mutations listed in `test:coverage-harness` spirit.
6. Recompute supply via `emission` vectors; match `mintedThrough`.
7. Print tip hash + genesis prefix `f1d193f62d54e982` for out-loud confirm.
8. Optional: `eth_call` anchors from `anchors.json` (no project library required).

Wire examples: gossip frames must preserve JSON key order for signed bodies — see
`test:wire-schema` (byte identity after parse). Live membership records travel in
`LedgerPixel.membership` + `lightProof.membershipDigest`.

**Invitation:** open an issue titled `second-client: <language>` with your verify tip hash
against `fixtures/crowned-47.json`. Vectors are the contract; this TypeScript repo is not.

Please tell us what was ambiguous. A specification that only its author can implement is a
specification with one implementation, which is where this project is now.

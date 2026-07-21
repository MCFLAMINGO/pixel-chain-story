# Pixel Ledger — Minimal Spec (v0.2)

Status: **draft, implemented in this repo**. Normative text is what the tests enforce.

## 1. Identity

- Name: **Pixel Ledger** (not a “blockchain of blocks”)
- Settlement unit: **pixel** (illuminated ledger cell)
- Native asset: **PIX** (hard cap 21_000_000; base unit 1e8)
- Builder fuel: **Light Credits** (uncapped; not monetary)
- Consensus: **Proof of Light Sequence (PoLS)**
- API face: **Source · Word · Light** (`One`)

## 2. Cryptography (current)

| Piece                     | Algorithm                   | Notes                                                                 |
| ------------------------- | --------------------------- | --------------------------------------------------------------------- |
| Hash                      | SHA-512                     | Via Web Crypto / runtime                                              |
| Signatures (OTS)          | PIX-HASH-OTS-128            | Merkle window of Lamport OTS leaves (32); each sign consumes one leaf |
| Signatures (PQ multi-use) | **PIX-ML-DSA-65**           | NIST FIPS-204 via `@noble/post-quantum`; domain-separated             |
| Surface                   | `signPixel` / `verifyPixel` | Scheme id in signature envelope                                       |
| Not used                  | ECDSA / Ed25519             | Classical ECC is out of scope for Pixel sigs                          |

Invariant: signature scheme is **versioned** and crypto-agile.  
Invariant: `verifyLight` (weak) is fail-closed; only scheme verifiers accept.  
Invariant: address ↔ public key binding is checked on PoLS proofs (scheme-aware).  
Invariant: PIX-HASH-OTS-128 `(publicKey, leafIndex)` is **single-use at consensus** (`usedOtsLeaves`; reuse → `OTS_LEAF_REUSED`). ML-DSA is multi-use.  
Priority: quantum security is **critical** — see [`QUANTUM.md`](./QUANTUM.md).

Leader election (lab): lowest `SHA-512(pols-lottery|prevHash|sequence|address)` among the **electable set bound into the light proof** (`electable[]`, committed as `el=` in the PoLS message). Public-input verifiable; **not** VRF/BFT. Registry growth after a pixel must not rewrite that pixel’s lottery.

## 3. State

```
State = {
  networkId,
  pixels: LedgerPixel[],
  utxos: Map<txid:vout, Utxo>,
  pending: Transaction[],  // superposition
  sequencers: { address, publicKey }[],
  usedOtsLeaves: Set<`${publicKey}:${leafIndex}`>
}
```

### LedgerPixel

- Links: `prevHash`, `index`, `sequence`
- Body: `transactions[]`, `merkleRoot`
- Light: `lightProof` (beacon + sequencer sig + `fieldDigest`)
- Appearance: `color`, `illuminated`, `proximity[]`
- Field: `field[]` — peer `FieldWitness` records (sphere combination lock)
- Invariant: `illuminated = false` ⇒ color absent (no RGB meaning)
- Invariant: `lightProof.fieldDigest` matches recomputed digest of peer field; mismatch ⇒ reject

### FieldWitness (sphere combination lock)

Tip custody is not linear `prevHash` alone. Peers at Chebyshev distance ≤ `FIELD_MAX_DISTANCE` (2) form a field:

| distance | opacity       | color in digest     |
| -------- | ------------- | ------------------- |
| 0        | `lit`         | full peer `#rrggbb` |
| 1        | `translucent` | full peer `#rrggbb` |
| ≥ 2      | `opaque`      | empty (no color)    |

Canonical `fieldDigest = SHA-512(field|peerIndex:distance:opacity:color|…)` (peers sorted by index). Bound into the PoLS message as `|field=<digest>`. `acceptBlock` / `verifyChain` recompute from prior pixel colors and reject mismatch.

**Invent note:** this is verification + continuity of the scene + tip custody — **not** a rename of `prevHash`. Evidence: `bun run test:field`.

### Transaction

- UTXO inputs/outputs
- Human `metadata` (signed)
- `commitment` while `state = superposition`
- `privacy ∈ {public, private, selective}`

## 4. PoLS

1. Pending txs sit in superposition (no color).
2. `electable =` current sequencer registry (ordered); bound into the light proof.
3. `nextSequencer = argmin SHA-512(pols-lottery|tipHash|sequence|addr)` over `electable` (skip=0).
4. Elected sequencer builds pixel: coinbase light-reward + pending txs.
5. Signs light proof (message includes `el=` commitment and `|field=<fieldDigest>`); peers `acceptPixel` with full verify.
6. UTXO set updates; pending cleared/conflict-dropped.

Invariant: `lightProof.electable` is the lottery set for that height; every address in it must be in the local registry; join/register after the fact cannot change prior elections.
Invariant: `lightProof.fieldDigest` is the sphere lock for that tip; wrong neighbor effects ⇒ reject.

### 4.1 Fault path (Gate C — lab)

If the elected sequencer is silent past `POLS_STALL_MS` (default 15s) after pending appears:

1. `skipCount` advances: elected = rotate `skipCount` steps from the skip=0 choice.
2. Light-proof message binds `skip=N` (`pols|…|skip=N`).
3. Peers accept only if stall window elapsed (`pendingSince` or parent tip time + `POLS_STALL_MS`).
4. **Fork-choice (depth 1):** at equal height prefer lower `skipCount`, then lower hash (`preferPixel` / `replaceTipIfBetter`).

This is **not BFT**. Assumed: loosely synchronized clocks, honest majority of sequencers over time. Max skip per height: `POLS_MAX_SKIP`.

Invariants:

- Only the skip-elected sequencer may produce pixel `n+1` for that `skipCount`
- Peers reject bad merkle, bad proof, bad color composition, bad fieldDigest, bad linkage, unjustified skip
- Light reward obeys emission schedule and hard cap
- On-time (`skip=0`) always preferred over skip tips at the same height

## 5. Economics

- Genesis reward: 50 PIX at pixel 0
- Halving every 210_000 pixels
- Cap: 21_000_000 PIX
- No burn
- Bridge value uses **lock/escrow**, not destruction
- **Bridge custody inversion:** foreign chain holds receipts only; Pixel holds the vault; foreign verify alone never releases master PIX (`BRIDGE_CUSTODY_AXIOM`, `bun run test:bridge-custody`)
- Dev/agent/SISO ops spend **Light Credits**, not the hard cap

## 6. SISO / Continuity

Artifacts register by **content digest** (any language/host).  
States: `outside → in_superposition → in_the_light → origin_dark`.  
No parallel-VM rewrite required.

## 7. Wire (gossip)

WebSocket JSON messages:

- `hello` (optional `helloSig`), `tx`, `pixel`, `get_pixels`, `pixels`, `get_headers`, `headers`

HTTP:

- `POST /rpc` JSON-RPC (`pix_*` including `pix_getHeaders`, `pix_getBalanceProof`)
- `GET /health`, `GET /sync`, `GET /sync/headers`, `GET /pixels`, `GET /balance/:addr[/proof]`

## 8. What this version does / does not claim

**Does:** local + multi-node sequential accept, persist, One API, SISO model, off-chain ULA package, Merkle-window hash-OTS (ledger single-use), diversity _policy_ when ≥7 providers registered, Gate B gossip join, Gate C lab stall-skip, Gate E ULA twin + custody inversion, Gate F headers-first + balance proofs + signed hello scoring (lab), 4-node lab mesh.

**Does not yet:**

- Global provider mesh / full BFT under partition (Gate C is timeout-skip + depth-1 tip replace, not quorum)
- ML-DSA defaulted for all new wallets / on-chain ULA verify of Dilithium (in-process ML-DSA **does** ship)
- Two-phone field hardening / device attestation beyond raster+getUserMedia path
- Kindling anti-phishing complete — `optical-capture` channel ships; remote device attestation still thin
- Audited production bridge — lab `ULAVerifier.sol` verifies keccak-OTS twin (`IS_STUB=false`); public testnet links + audit still open (see `BRIDGE-STATUS.md`)
- Production gossip (no peer auth, fragile catch-up)

Frame this honestly: a coherent lab prototype with real running crypto and UTXO settlement — **Gate A** on the path to an L1 / bridge / sovereignty regime.  
Destination and claim unlocks: [`PATH.md`](./PATH.md). Do not claim Gates B–J until their evidence exists.

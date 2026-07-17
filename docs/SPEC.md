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

| Piece | Algorithm | Notes |
| --- | --- | --- |
| Hash | SHA-512 | Via Web Crypto / runtime |
| Signatures (OTS) | PIX-HASH-OTS-128 | Merkle window of Lamport OTS leaves (32); each sign consumes one leaf |
| Signatures (PQ multi-use) | **PIX-ML-DSA-65** | NIST FIPS-204 via `@noble/post-quantum`; domain-separated |
| Surface | `signPixel` / `verifyPixel` | Scheme id in signature envelope |
| Not used | ECDSA / Ed25519 | Classical ECC is out of scope for Pixel sigs |

Invariant: signature scheme is **versioned** and crypto-agile.  
Invariant: `verifyLight` (weak) is fail-closed; only scheme verifiers accept.  
Invariant: address ↔ public key binding is checked on PoLS proofs (scheme-aware).  
Priority: quantum security is **critical** — see [`QUANTUM.md`](./QUANTUM.md).

## 3. State

```
State = {
  networkId,
  pixels: LedgerPixel[],
  utxos: Map<txid:vout, Utxo>,
  pending: Transaction[],  // superposition
  sequencers: { address, publicKey }[]
}
```

### LedgerPixel

- Links: `prevHash`, `index`, `sequence`
- Body: `transactions[]`, `merkleRoot`
- Light: `lightProof` (beacon + sequencer sig)
- Appearance: `color`, `illuminated`, `proximity[]`
- Invariant: `illuminated = false` ⇒ color absent (no RGB meaning)

### Transaction

- UTXO inputs/outputs
- Human `metadata` (signed)
- `commitment` while `state = superposition`
- `privacy ∈ {public, private, selective}`

## 4. PoLS

1. Pending txs sit in superposition (no color).
2. `nextSequencer = H(tipHash, sequence) mod |sequencers|`
3. Elected sequencer builds pixel: coinbase light-reward + pending txs.
4. Signs light proof; peers `acceptPixel` with full verify.
5. UTXO set updates; pending cleared/conflict-dropped.

Invariants:

- Only elected sequencer may produce pixel `n+1`
- Peers reject bad merkle, bad proof, bad color composition, bad linkage
- Light reward obeys emission schedule and hard cap

## 5. Economics

- Genesis reward: 50 PIX at pixel 0
- Halving every 210_000 pixels
- Cap: 21_000_000 PIX
- No burn
- Bridge value uses **lock/escrow**, not destruction
- Dev/agent/SISO ops spend **Light Credits**, not the hard cap

## 6. SISO / Continuity

Artifacts register by **content digest** (any language/host).  
States: `outside → in_superposition → in_the_light → origin_dark`.  
No parallel-VM rewrite required.

## 7. Wire (gossip)

WebSocket JSON messages:

- `hello`, `tx`, `pixel`, `get_pixels`, `pixels`

HTTP:

- `POST /rpc` JSON-RPC (`pix_*`)
- `GET /health`, `GET /pixels`, `GET /balance/:addr`

## 8. What this version does / does not claim

**Does:** local + multi-node sequential accept, persist, One API, SISO model, off-chain ULA package, Merkle-window hash-OTS, diversity *policy* when ≥7 providers registered.

**Does not yet:**
- Global provider mesh / BFT fork-choice / reorgs (offline elected sequencer stalls the tip)
- ML-DSA defaulted for all new wallets / on-chain ULA verify of Dilithium (in-process ML-DSA **does** ship)
- Two-phone field hardening / device attestation beyond raster+getUserMedia path
- Kindling anti-phishing complete — `optical-capture` channel ships; remote device attestation still thin
- Audited on-chain bridge verifier — `ULAVerifier.sol` is an explicit stub
- Production gossip (no peer auth, fragile catch-up)

Frame this honestly: a coherent lab prototype with real running crypto and UTXO settlement — **Gate A** on the path to an L1 / bridge / sovereignty regime.  
Destination and claim unlocks: [`PATH.md`](./PATH.md). Do not claim Gates B–J until their evidence exists.

# Lumen — light-native language (L0)

Pixel’s money layer can look like every other UTXO demo. **Lumen is why it isn’t.**

L0 thesis: **where there is light, there is verification.**  
Wealth is one face. The deeper store is **creation** — attestation that something existed under light. Quantum-resistant digests mean that proof can be recomputed anywhere the same light still runs; an EMP in one location does not erase verification that survives in another.

```
ghost proof = attest("I made this")   # existence under light
when light:
  paint proof                         # the picture gains a dot

ghost tx = commit(...)                # superposition (wealth face)
veil tx private
when light:
  shine tx via sequence               # PoLS illuminate
  collapse tx                         # one truth
  paint tx
```

## The complex hash issue — simplified

Under the hood Pixel uses many domain-separated SHA-512 strings (`superposition|…`, `txid|…`, `pix-addr|…`, OTS merkle, optical checksums, …). That soup is a respect landmine for authors.

**One door:** `lightDigest(kind, …parts)` in [`src/lib/pixel/light-digest.ts`](../src/lib/pixel/light-digest.ts).

| Lumen verb | Host | Author never sees |
| --- | --- | --- |
| `digest(label, x)` | `lightDigest` | `sha512Hex("superposition\|…")` |
| `attest(what)` | `attestExistence` | OTS leaves, merkle windows, scheme IDs |
| `commit(…)` | still signs with PQ/OTS behind the host | Lamport complements / Dilithium bytes |
| `project` / `maze` | `asOpticalPayload` | pad/slice hex dances |

Lumen programmers write **light verbs**. The host holds quantum schemes and leaf cursors.

## Status

| Piece | State |
| --- | --- |
| Parser (`parse.ts`) | Real |
| Interpreter (`runtime.ts`) | Real — UTXO + optical + **digest/attest** |
| `lightDigest` | Real — shared with tx commitment path |
| Example module | `TRANSFER_LUMEN` — `send` / `read_key` / **`exist`** |
| Lab UI | `/lab` → LumenPanel |
| CI | `bun run test:pixel` + `bun run test:lumen` |

## Why this answers “quit”

- **Not only store of wealth** — `attest` / `exist` is store of creation.
- **L0, not L1 cosplay** — verification is “can you recompute the light digest,” not BFT theater.
- **Quantum future** — host signs with hash-OTS + ML-DSA; Lumen stays scheme-agnostic.
- **Seurat / agents** — each existence proof or illuminated pixel is a dot; agents fill the canvas by running light elsewhere.

## Evolve plan

1. [x] Lab editor — `/lab` LumenPanel  
2. [x] `digest` / `attest` — one hash door  
3. Rays for Kindling / Worldlight / SISO `shine_in`  
4. Better diagnostics — parse errors with light vocabulary  
5. No fake ops — every builtin must touch chain/optical/custody for real  

## Run today

```bash
bun run test:lumen   # digest + attest + exist ray
bun run test:pixel   # send + read_key still green
```

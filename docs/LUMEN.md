# Lumen — light-native language (L0)

Pixel’s money layer can look like every other UTXO demo. **Lumen is why it isn’t.**

> The art is not floating free of the science — it is guided by it the way good painting is guided by light it never names.  
> — `One.Creed.guide`

Lumen is the brush. `lightDigest`, PoLS, PQ signatures, UTXO consume — the light that guides without being named in the poem. If a verb cannot touch a real invariant, it is not ready to ship.

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

| Lumen verb         | Host                                    | Author never sees                      |
| ------------------ | --------------------------------------- | -------------------------------------- |
| `digest(label, x)` | `lightDigest`                           | `sha512Hex("superposition\|…")`        |
| `attest(what)`     | `attestExistence`                       | OTS leaves, merkle windows, scheme IDs |
| `commit(…)`        | still signs with PQ/OTS behind the host | Lamport complements / Dilithium bytes  |
| `project` / `maze` | `asOpticalPayload`                      | pad/slice hex dances                   |

Lumen programmers write **light verbs**. The host holds quantum schemes and leaf cursors.

## Status

| Piece                               | State                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Parser (`parse.ts`)                 | Real — typed ray headers + `let x: kind`                               |
| Interpreter (`runtime.ts`)          | Real — language power + **strict `checkLumen` on run**                 |
| Types (`types.ts` / `check.ts`)     | Progressive light kinds — `LumenTypeError` on dark mismatches          |
| Persist (`persist.ts` / node store) | Beside chain — localStorage + `lumen-modules.json`                     |
| Example module                      | Typed `TRANSFER_LUMEN` — `funded_kindle` / `pay_composed` / `tip_wave` |
| Lab UI                              | `/lab` → LumenPanel (persist / reset)                                  |
| CI                                  | `bun run test:pixel` + `bun run test:lumen`                            |

## Why this answers “quit”

- **Not only store of wealth** — `attest` / `exist` is store of creation.
- **L0, not L1 cosplay** — verification is “can you recompute the light digest,” not BFT theater.
- **Quantum future** — host signs with hash-OTS + ML-DSA; Lumen stays scheme-agnostic.
- **Seurat / agents** — each existence proof or illuminated pixel is a dot; agents fill the canvas by running light elsewhere.

## Product builtins (host-bound)

| Lumen verb                 | Host                                | Real invariant                        |
| -------------------------- | ----------------------------------- | ------------------------------------- |
| `tip()`                    | chain tip `lightProof`              | `waveDigest` + `spatialRoot`          |
| `kindle(from,to,amt,memo)` | `Kindling` offer→accept→seal→settle | Presence Seal + self-custody UTXO     |
| `shine_in(owner,usd)`      | `ingressUsd` + `illuminateIngress`  | Worldlight $ → PIX on Personal Source |
| `balance(who)`             | `balanceOf`                         | UTXO holdings                         |

## Power class (vs Rust)

Rust is excellent for systems memory. Lumen aims for the **same class of power for light** — invent, don’t rename:

| Rust power       | Lumen invent                           | Binding                                                     |
| ---------------- | -------------------------------------- | ----------------------------------------------------------- |
| Ownership / move | Ghost consume on `collapse`            | Re-veil / re-shine of collapsed ghost → `LumenRuntimeError` |
| `match`          | `match pay: settled: … _: …`           | Branches on light kind                                      |
| `Result` / `?`   | `ensure cond, "msg"` / `refuse("msg")` | Light vocabulary failures                                   |
| Guarded blocks   | `when aperture <cond>:`                | Body runs only when condition holds                         |
| Functions        | Ray composition `funded_kindle(...)`   | Module rays callable like functions                         |
| Field access     | `t.waveDigest`                         | Tip / proof / settled / ghost payload                       |
| `if` + arith     | `if n >= amount:` / `+ - * /`          | Amount gates before spend                                   |

Not a Rust clone. No borrow checker cosplay. The physics is superposition → shine → collapse → paint.

## Types (progressive)

```
ray holdings(who: string) -> number:
  let n: number = balance(who)
  return n
```

Light kinds: `number` `string` `bool` `address` `ghost` `picture` `settled` `tip` `proof` `unit` `any`.  
`checkLumen` / `runLumenSource` (strict by default) refuse dark mismatches via `LumenTypeError`.

## Persist beside chain

| Surface      | Location                                    |
| ------------ | ------------------------------------------- |
| Browser lab  | `localStorage` key `pixel.lumen.modules.v1` |
| Node datadir | `lumen-modules.json` next to `chain.json`   |

Source text is canonical; re-parse + type-check on load. Seeded with `TRANSFER_LUMEN` on first node start / empty lab.

## Evolve plan

1. [x] Lab editor — `/lab` LumenPanel
2. [x] `digest` / `attest` — one hash door
3. [x] Rays for Kindling / Worldlight `shine_in` + tip sense
4. [x] Language power — match, aperture, ensure/refuse, composition, ownership
5. [x] Diagnostics — `LumenParseError` / `LumenRuntimeError` with light vocabulary
6. [x] Persist modules beside chain state + typed ray surface
7. No fake ops — every builtin must touch chain/optical/custody for real

## Run today

```bash
bun run test:lumen   # product rays + language power
bun run test:pixel   # send + read_key still green
bun run test:wallet  # people-wallet nextLeaf across unlock
```

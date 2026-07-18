# Lab mesh / mini-devnet

**Status:** local multi-process lab — not a public mainnet.

## What ships

| Artifact                    | Command                  |
| --------------------------- | ------------------------ |
| 2-node gossip               | `bun run test:net`       |
| 4-node mesh + tip extension | `bun run test:four-node` |
| Leader lottery (lab)        | `bun run test:election`  |
| OTS single-use at ledger    | `bun run test:ots-reuse` |

## Honesty

- Sequencer set is **permissioned** (who joins the mesh).
- Leader election is a **public-input hash lottery** (`pols-lottery|…`) over the electable set **bound into each light proof** — deterministic and checkable, **not** a cryptographic VRF and **not** BFT.
- OTS leaves are single-use at consensus (`usedOtsLeaves`; `bun run test:ots-reuse`).
- Fork-choice remains depth-1 (`preferPixel` / `replaceTipIfBetter`) from Gate C.
- No slashing, no DA sampling, no public explorer yet.

## Continuity demo (SISO — “store stays up when AWS dies”)

Not Amazon the company — a **storefront that shone in**. Claim shape:

1. Origin API process plays “AWS” (kill it).
2. Checkout/settlement keeps working via remaining Pixel sequencers + SISO mirrors.
3. Honest line: _continuity of settlement & mirrored artifact_, not “we replace AWS compute.”

Lab today: `test:four-node` + kill one node mid-tip — peers still extend (Gate C skip).  
Public “AWS went dark, store didn’t” needs Gate G diversity + Gate J chaos drill ([`CONTINUITY-SISO.md`](./CONTINUITY-SISO.md)).

## Next to become attackable

1. Publish a long-lived 4+ node host set (home/VPS mix) with fixed seeds.
2. Real VRF or BFT quorum over that set.
3. SISO chaos drill: origin_dark while mirrors serve a real checkout path.
4. Equivocation slash + explorer.

Until then: clone, run `test:four-node`, try to break tip agreement.

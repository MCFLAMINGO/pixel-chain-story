# The picture: plan before code

Written 14 August 2026, after an inventory of what already exists. **No implementation
here.** Three requirements arrived together and they are one design:

1. The picture should change continuously, like fireflies, for each transaction.
2. It is always about **relationship to the tip**.
3. Each gift is a new pixel, with the capability to light having been expressed.

The inventory found that most of the machinery for (1) and (2) is already built and
consensus-bound. Only (3) is a real architectural change — and it is smaller than it looks,
because the right unit already exists and is simply not rendered.

---

## What already exists

Worth stating plainly, because it is easy to write a fourth version of any of these.

### Relationship to the tip is already three systems

| System                  | Space                | Neighbour rule                           | PoLS-bound?               |
| ----------------------- | -------------------- | ---------------------------------------- | ------------------------- |
| `proximity`             | chain index + √ grid | prior indices within radius 2            | no (recomputed on accept) |
| `field` / `fieldDigest` | `indexToLattice`     | Chebyshev ≤ 2                            | **yes**                   |
| `wave` / `waveDigest`   | `indexToLattice`     | 6-neighbour BFS, ≤ 2 hops, occupied only | **yes**                   |

`computeTipWaveField` already computes the tip's outgoing wave _plus residue from the last
eight leads_ (`WAVE_LOOKBACK = 8`), with amplitude decaying `WAVE_DAMPING = 0.55` per hop.

### The wave already _is_ the firefly

This is the finding that matters. A `WaveHit` carries `amplitudeMilli`, decays per hop, and
fades as its lead recedes from the tip. `SpatialSinkView` already animates it with
`requestAnimationFrame` — orbit, pulse on wave spheres, emissive breath.

**So a decaying disturbance propagating from the tip, verifiable and consensus-bound, is
already in the chain.** `firefly.ts`'s wall-clock decay was a second, weaker version of it:
weaker because wall-clock brightness is unverifiable and every node computes a different
value, whereas wave amplitude is agreed.

**Decision: fireflies should be driven by the wave field, not by wall-clock decay.**
`fireflyBrightness` stays useful only as a UI smoothing term between tips.

### Position already exists, and three UI grids disagree with it

`indexToLattice(index)` is the consensus layout: `side = ceil(sqrt(index+1))`, `z` always 0.
Committed through `spatialRoot`.

But `LedgerField` uses `cols = max(12, ceil(sqrt(count*1.6)))`, `chainToRealityField` uses
`max(8, ceil(sqrt(n*1.4)))`, and `revealProximity` uses `ceil(sqrt(focusIndex+1))`. **Four
layouts, one of which is consensus.** No coherent picture is possible until they agree.

### Colour is frozen at mint; brightness is not consensus at all

`composePixelColor` runs once at mint and is stored in `LedgerPixel.color`, verified on
accept. No component recomputes it. `observer` mode is displayed in a tooltip and changes
nothing.

`pixelBrightness` is UI-only and cumulative — it has no time argument, so it can never dim.
That is why the picture cannot currently twinkle.

### The unit for "each gift is a pixel" already exists

`lit-cell.ts` already subdivides a pixel **one cell per transaction**, with
`LitCell = { pixelIndex, cellIndex, owner, kind, meaning, txid, amount }`, and `owner`
derived from `authorOf(tx)`. A coinbase is a `light_reward`; every spend is a `moment`.

So "each gift is a new pixel" does **not** require re-founding blocks. It requires the
picture to render **cells** rather than blocks. A gift already creates a cell with an owner
and a meaning; nothing draws it.

`litCellsRoot` and `pixelAuthorshipRoot` exist but are explicitly **derived, not committed**.

---

## The design

**A block is how the chain agrees. A pixel is what the picture shows. These are currently
the same object, and that is the whole problem.** The canvas today depicts consensus
mechanics — one dot per block, positioned by block index — when it should depict people
meeting.

Separating them mirrors a split this project has already made once, in
`presence-peg.ts`: the record is not the money. Now: **the picture is not the ledger.**

|                     | Today                        | Proposed                                  |
| ------------------- | ---------------------------- | ----------------------------------------- |
| Unit of the picture | block (`LedgerPixel`)        | **lit cell** (one per gift/moment)        |
| Position            | `indexToLattice(blockIndex)` | derived from the **pair**, not from time  |
| Created by          | the sequencer, every block   | **a gift** — someone welcoming someone    |
| Brightness          | cumulative, never dims       | **wave amplitude**, decaying from the tip |
| Capacity            | unbounded blocks over time   | one welcome per person; cap = population  |

Under this, the canvas fills as humanity joins rather than as time passes, and the number
that fell out of `end-state.ts` — 10.3e9, one per peak-human — becomes the canvas size
rather than a coincidence. A square canvas of 101,489 × 101,489 holds exactly the cap.

---

## Phases, cheapest and safest first

### Phase 0 — one layout (prerequisite, no consensus change)

Make every renderer use `indexToLattice`. Delete or reconcile the three competing grids.
Nothing else here is coherent until the picture has one geometry.

**Risk:** low. Display only. **Blocks:** everything below.

### Phase 1 — the picture breathes, from the wave (no consensus change)

Render brightness from `computeTipWaveField` instead of `pixelBrightness`. Amplitude already
decays per hop and per lead age, so the picture moves with each tip and settles between them.
`fireflyBrightness` supplies only inter-tip smoothing.

`LedgerField` has no time loop; `SpatialSinkView` already has one. Either give `LedgerField` a
`requestAnimationFrame` loop or route the 2D picture through the sink's animation model.

**Risk:** low — brightness is not consensus. **Delivers requirement (1) and (2).**

### Phase 2 — render cells, not blocks (no consensus change)

Draw one point of light per `LitCell` rather than per block, using `litCellsOf`. A pixel with
five moments becomes five lights, each owned by whoever authored it. Positions still derived
from `pixelIndex` + `cellIndex` at this stage.

**Risk:** low-moderate — pure rendering, but changes what the picture _means_, so it should
be seen before going further. **Delivers requirement (3) visually.**

### Phase 3 — commit authorship

Bind `litCellsRoot` into the PoLS payload so the cell picture is verifiable rather than
derived. Today two nodes could disagree about who owns a cell with nothing to catch it.

**Risk:** moderate. Consensus change, needs a network-id namespace and its own adversarial
tests. **Prerequisite for the picture being evidence rather than decoration.**

### Phase 4 — position by relationship

Derive a cell's coordinate from the **pair** — `H(giver, receiver)` folded into the lattice —
so that a gift's pixel sits where the relationship is, and the picture becomes a portrait of
the graph rather than of the clock.

**Risk:** high. Needs collision handling (two pairs hashing to one cell), and it interacts
with `field`/`wave` because both derive neighbours from `indexToLattice`. Changing what a
coordinate _means_ changes what the sphere lock and the lead wave are computing over.

**Open:** whether relationship-positioning replaces lattice-by-index or is a second
projection rendered alongside it. A second projection is far cheaper and loses nothing except
elegance.

---

## What not to do

- **Do not add a fourth decay model.** The wave is the decay, and it is agreed.
- **Do not make brightness consensus-bound** unless the picture must be evidence. It is
  currently free to be beautiful precisely because nothing depends on it.
- **Do not re-found blocks as gifts.** Blocks order the chain; cells carry authorship. The
  requirement is satisfied by rendering cells, not by replacing consensus.
- **Do not wire the gift mint-back** to any of this. It is still blocked on identity costing
  something — see [`FARMING-AND-THE-MINT-BACK.md`](./FARMING-AND-THE-MINT-BACK.md).

---

## Open questions, in the order they block work

1. **Phase 0:** which layout wins? `indexToLattice` is the only consensus-bound one, so
   presumably it does — but `LedgerField`'s denser grid exists because the sparse one looks
   empty early. Does the picture accept looking empty?
2. **Phase 2:** should a `light_reward` cell be drawn at all? A sequencer's wage is not a
   moment between people. Drawing it puts machine activity in a picture of relationships.
3. **Phase 3:** is the picture evidence or decoration? Committing authorship makes it
   evidence and costs a consensus change.
4. **Phase 4:** replace the lattice or project alongside it?
5. **Capacity:** if a pixel is a welcome and the cap is the canvas, the canvas is full when
   humanity is. Is that the intended ending, given `end-state.ts` showed the fixed cap also
   implies a last page?

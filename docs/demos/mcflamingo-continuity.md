# Demo — McFlamingo continuity (honest)

## What is real

| Thing | Where |
| --- | --- |
| Restaurant homepage | https://www.mcflamingo.com/ |
| **Food menu** | https://www.mcflamingo.com/menu |
| Online ordering | https://www.mcflamingo.com/popmenu-order |

Those URLs are the live Popmenu restaurant. If they work in your normal browser, the menu is real.

## What Continuity does on Pixel (real)

When you shine in McFlamingo from `/shine` or the Continuity desk:

1. Digest = sha512 of homepage HTML (live or snapshot)
2. Pixel genesis (browser) + 1-PIX self-memo with reference `CONT-<digest…>`
3. Continuity record `in_the_light` at the **actual tip index** (not a fake `pixelIndex: 1`)

Proof fields on the store: `anchoredOnPixel`, `pixelIndex`, `tipHash`, `registerRef`.

```bash
bun run test:shine-chain
```

## What Continuity does *not* do

- Host or replace the Popmenu menu HTML
- Public DNS failover when Popmenu dies
- Cross-phone invite store (still same-browser localStorage for the desk UI)
- Automatic till UTXOs from Toast/Popmenu checkouts (till bookkeeping is still lab)

## How to try it

```bash
bun install && bun run dev
```

1. http://localhost:8080/shine → **Try with real McFlamingo**  
2. Success must show **Anchored on Pixel at tip #N · CONT-…**  
3. **Open live McFlamingo menu** → www.mcflamingo.com/menu  
4. Continuity desk shows the same tip proof under the store

## CLI

```bash
bun run test:shine-chain   # digest → real tip
bun run test:mcflamingo    # kill-origin lab booth drill
```

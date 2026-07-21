# Demo — McFlamingo continuity (honest)

## What is real

| Thing               | Where                                    |
| ------------------- | ---------------------------------------- |
| Restaurant homepage | https://www.mcflamingo.com/              |
| **Food menu**       | https://www.mcflamingo.com/menu          |
| Online ordering     | https://www.mcflamingo.com/popmenu-order |

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

## What Continuity does _not_ do

- Host or replace the Popmenu menu HTML
- Public DNS failover when Popmenu dies
- Auto-configured Popmenu/Toast dashboard (you still point their webhook at Pixel with a secret)

Cross-phone invites: **invite pack** from the Continuity desk, or node `GET /continuity/invite/:token` after ops sync. Order path: `POST /continuity/order` on the Pixel node (`bun run test:continuity-deepen`).

## Booth + till on Pixel (real UTXOs)

After shine-in / go-live:

1. Desk → **Mark origin dark** (or **Check origin health** when probe fails)
2. Open `/continuity/booth/www.mcflamingo.com` → **Pay with Pixel**
3. Sale tip + till fee tip land on the Continuity session chain; desk till list shows `on-chain tip #N`

```bash
bun run test:continuity-order
```

## How to try it

```bash
bun install && bun run dev
```

1. http://localhost:8080/shine → **Try with real McFlamingo**
2. Success must show **Anchored on Pixel at tip #N · CONT-…**
3. **Open live McFlamingo menu** → www.mcflamingo.com/menu
4. Continuity desk → booth → Pay with Pixel (till fees only after origin dark)

## CLI

```bash
bun run test:shine-chain        # digest → real tip
bun run test:mcflamingo         # kill-origin lab booth drill
bun run test:continuity-order   # booth sale + on-chain till
```

# Demo — McFlamingo continuity (real website)

**Claim:** _Continuity origin is the live restaurant at [www.mcflamingo.com](https://www.mcflamingo.com/); a homepage digest stays on Pixel; lab booths can serve a captured snapshot when drilling origin-dark._  
**Does not unlock:** public DNS failover for `mcflamingo.com`, “AWS-proof internet,” or Pixel replacing Popmenu/Toast hosting.

## Real site

| | |
| --- | --- |
| Origin | https://www.mcflamingo.com/ |
| Order | https://www.mcflamingo.com/popmenu-order |
| Platform | Popmenu (+ Toast gift cards) |
| Continuity snapshot | [`public/mcflamingo/homepage-snapshot.html`](../../public/mcflamingo/homepage-snapshot.html) — captured homepage for digest / lab mirrors |
| Booth redirect | [`public/mcflamingo/index.html`](../../public/mcflamingo/index.html) — sends humans to the live site |

## Before Continuity invites (lab)

1. Create the offer on `/continuity` (or use the one-click demo below).  
2. **Same browser profile** — invites use `localStorage` today; a merchant on another phone will see “Link not found.”  
3. Merchant only taps **Turn on Continuity** — no DNS homework.  
4. You attach digest + booths before Go live (demo does this for you).

## Easy path (UI)

```bash
bun run dev
```

1. Open [http://localhost:8080/continuity](http://localhost:8080/continuity) or [/shine](http://localhost:8080/shine)  
2. Click **Demo: real McFlamingo shines in** / **Try with real McFlamingo**  
3. Preview storefront: [www.mcflamingo.com](https://www.mcflamingo.com/) — **not** a fake local menu  
4. Optional: **Run lab chaos drill** (origin dark → till accrues on lab bookkeeping)

Also from Lab: Continuity demos.

## CLI proof (kill lab booth)

```bash
bun run test:mcflamingo
# alias: bun run test:continuity
```

What it proves:

1. Real-site homepage snapshot gets a digest and shines into Pixel (SISO) with **originUrl = www.mcflamingo.com**.  
2. Lab **origin booth** is killed (outage stand-in).  
3. Lab **mirror** still serves the **same** snapshot (digest match).  
4. Checkout of **3 PIX** settles while Continuity is `origin_dark`.

## Next (not this demo)

- Refresh `homepage-snapshot.html` when the live Popmenu homepage changes materially  
- Shared invite store (so a real merchant phone works)  
- Nebius / Hetzner booths + real failover  
- Kindling spend from a phone against a mirrored booth

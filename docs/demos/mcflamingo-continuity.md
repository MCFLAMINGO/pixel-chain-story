# Demo — McFlamingo continuity (easy shine-in)

**Claim:** _Storefront artifact stays servable + PIX checkout can settle after origin kill (lab)._  
**Does not unlock:** public DNS failover for `mcflamingo.com`, “AWS-proof internet,” or Pixel-as-hosting.

## Before Continuity invites (lab)

1. Create the offer on `/continuity` (or use the one-click demo below).  
2. **Same browser profile** — invites use `localStorage` today; a merchant on another phone will see “Link not found.”  
3. Merchant only taps **Turn on Continuity** — no DNS homework.  
4. You attach digest + booths before Go live (demo does this for you).

## Easy path (UI)

```bash
bun run dev
```

1. Open [http://localhost:8080/continuity](http://localhost:8080/continuity)  
2. Click **Demo: McFlamingo shines in**  
3. Preview storefront: [/mcflamingo/](http://localhost:8080/mcflamingo/)  
4. Optional: **Run lab chaos drill** (origin dark → till accrues)

Also from Lab: **Easy Continuity: McFlamingo demo →**

## CLI proof (kill origin)

```bash
bun run test:mcflamingo
# alias: bun run test:continuity
```

What it proves:

1. McFlamingo menu bytes get a digest and shine into Pixel (SISO).  
2. **Origin** HTTP process is killed (AWS-down stand-in).  
3. **Mirror** still serves the **same** HTML (digest match).  
4. Checkout of **3 PIX** settles while origin is dark.

Storefront: [`public/mcflamingo/index.html`](../../public/mcflamingo/index.html)

## Next (not this demo)

- Shared invite store (so a real merchant phone works)  
- Nebius / Hetzner booths + real failover  
- Kindling spend from a phone against the mirrored menu

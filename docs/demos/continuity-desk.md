# Continuity desk — merchant handshake (lab)

**For:** you as operator (sales + health).  
**Merchant:** one secure link → **Turn on Continuity** — no DNS/rsync vocabulary.  
**Held:** agentic publish/failover runners (booth jobs stay operator-side for now).

## Before you send invites (lab)

1. Create the offer on `/continuity` first (mints the token).  
2. **Same browser** — ops state is `localStorage`; another device will say “Link not found.”  
3. Merchant does **not** need DNS or a digest.  
4. Shortcut: **Demo: real McFlamingo shines in** seeds Continuity from the live origin `https://www.mcflamingo.com/` (digest from live HTML when fetchable, else `public/mcflamingo/homepage-snapshot.html`).  
5. **Open join page** must show the **merchant** screen (`Continuity · merchant` / Turn on Continuity) — not the operator desk. If you still see the admin wizard, you’re on a build before the join-route un-nest fix.

## Run

```bash
bun run dev
```

Open:

- Admin: [http://localhost:8080/continuity](http://localhost:8080/continuity)  
- One-click: **Demo: real McFlamingo shines in**  
- Storefront preview: [www.mcflamingo.com](https://www.mcflamingo.com/)  
- Continuity snapshot (lab digest/booth): [/mcflamingo/homepage-snapshot.html](http://localhost:8080/mcflamingo/homepage-snapshot.html)  
- Merchant invite: `/continuity/join/<token>` (same browser)  
- Kill-origin CLI: `bun run test:mcflamingo` — see [`mcflamingo-continuity.md`](./mcflamingo-continuity.md)

## Money shape

| Piece | When | What |
| --- | --- | --- |
| **Map fee** | Always while covered | ~$15–30/mo (`priceUsdPerMonth`) |
| **Till** | Origin dark + sales still clear | Default **100 bps (1%)** of PIX volume (`tillCutBpsWhenOriginDark`) |

Till is **local bookkeeping** (`tillEvents` / `recordTillSettlement`) — not on-chain settlement. Accrues only while till is active.

## Lab chaos drill

```bash
bun run test:chaos-drill
```

Walks: live → origin dark → `canServeWithoutOrigin` → till accrues on simulated PIX.  
Desk button: **Run lab chaos drill**. This is Continuity lab evidence — **not** Gate J public-regime drill.

## Admin steps

1. **Create offer** — business name, domain, map fee  
2. **Copy secure link** — send to merchant  
3. **Merchant turns on** — one button (digest optional; you may attach later)  
4. **Assign booths** — which of your 5 rung URLs serve them  
5. **Go live** — SISO digest in the light + **operator booth jobs** checklist  
6. **Mark origin dark** (when failover happens) — till activates  

## Merchant experience

Secure link only. Offer copy + **Turn on Continuity**. No digest upload required. No admin chrome.

## Tests

```bash
bun run test:continuity-ops
```

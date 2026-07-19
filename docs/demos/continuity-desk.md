# Continuity desk — merchant handshake (lab)

**For:** you as operator (sales + health).  
**Merchant:** one secure link → **Turn on Continuity** — no DNS/rsync vocabulary.  
**Held:** agentic publish/failover runners (booth jobs stay operator-side for now).

## Run

```bash
bun run dev
```

Open:

- Admin: [http://localhost:8080/continuity](http://localhost:8080/continuity)
- Merchant invite: `/continuity/join/<token>`

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

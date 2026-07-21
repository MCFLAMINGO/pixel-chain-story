# Continuity desk — merchant handshake (lab)

**For:** you as operator (sales + health).  
**Merchant:** one secure link → **Turn on Continuity** — no DNS/rsync vocabulary.  
**Held:** agentic publish/failover runners (booth jobs stay operator-side for now).

## Before you send invites (lab)

1. Create the offer on `/continuity` first (mints the token).
2. **Cross-phone:** **Copy invite pack** on the desk and send it to the merchant — they paste on the join page if ops aren’t on their phone yet. Or sync ops to a Pixel node (`PUT /continuity/ops`) so `GET /continuity/invite/:token` works.
3. Merchant does **not** need DNS or a digest.
4. Shortcut: **Demo: real McFlamingo shines in** seeds Continuity from the live origin `https://www.mcflamingo.com/` (digest from live HTML when fetchable, else `public/mcflamingo/homepage-snapshot.html`).
5. **Open join page** must show the **merchant** screen (`Continuity · merchant` / Turn on Continuity) — not the operator desk.

**Discipline:** every Continuity pitch pairs usefulness with “settlement and the map live on Pixel — Pixel does not host the internet.” See [`operator-dns.md`](./operator-dns.md).

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

| Piece       | When                            | What                                                                |
| ----------- | ------------------------------- | ------------------------------------------------------------------- |
| **Map fee** | Always while covered            | ~$15–30/mo (`priceUsdPerMonth`)                                     |
| **Till**    | Origin dark + sales still clear | Default **100 bps (1%)** of PIX volume (`tillCutBpsWhenOriginDark`) |

Till is a **journal** (`tillEvents` / `recordTillSettlement`) plus **optional on-chain UTXOs** via the Continuity booth (`settleBoothCheckoutOnPixel`). Accrues only while till is active. Journal-only rows are labeled; booth payments set `onChain` + `txid`.

## Continuity booth (real PIX)

```
/continuity/booth/<domain>
```

**Pay with Pixel** funds an ephemeral customer, settles to the merchant address, and — when origin is dark — moves the till fee UTXO to the till address. Same-browser `localStorage` session (`pixel.continuity.chain.v1`).

```bash
bun run test:continuity-order
bun run test:continuity-deepen   # invite packs + POST /continuity/order webhook
```

## Lab chaos drill

```bash
bun run test:chaos-drill
```

Walks: live → origin dark → `canServeWithoutOrigin` → till journal accrues.  
Desk: **Check origin health** (ops flip if probe fails) · **Open Continuity booth** · **Run lab chaos drill**. Not Gate J.

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

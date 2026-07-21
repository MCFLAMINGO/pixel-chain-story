# Operator DNS / failover notes (honest)

Continuity does **not** take over `mcflamingo.com` DNS today.

| Layer             | Who owns it                    | Continuity role                      |
| ----------------- | ------------------------------ | ------------------------------------ |
| Public domain     | Merchant / registrar           | Untouched                            |
| Live menu / order | Popmenu (`www.mcflamingo.com`) | Linked as origin of truth            |
| Continuity map    | Pixel tip `CONT-<digest>`      | Proves which artifact was shone in   |
| Continuity booth  | `/continuity/booth/$domain`    | Settles PIX while Continuity is live |
| Till fees         | Pixel UTXOs when `origin_dark` | Ops mark or origin health probe      |

## What operators can do now

1. Shine in / go live → digest anchored on Pixel
2. **Check origin health** on `/continuity` — failed probe → mark `origin_dark` (ops flip)
3. Customers use **Pay with Pixel** at the Continuity booth
4. Popmenu still serves menu/order when up

## What is still operator homework (not automated)

- Pointing DNS / CDN failover at Continuity mirrors
- Wiring Popmenu/Toast webhooks to `handleContinuityOrder` with a shared secret
- Gate J public chaos drill evidence

Do not tell merchants “Pixel hosts your site” or “DNS is flipped.” Tell them: map + till on Pixel; checkout booth settles PIX; live food still opens on Popmenu.

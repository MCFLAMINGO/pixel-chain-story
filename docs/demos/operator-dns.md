# Operator DNS / failover notes (honest)

Continuity does **not** take over `mcflamingo.com` DNS today. Continuity ops deepen Pixel (map + settlement + invites + webhook) without claiming Pixel hosts the internet.

| Layer              | Who owns it                    | Continuity role                                             |
| ------------------ | ------------------------------ | ----------------------------------------------------------- |
| Public domain      | Merchant / registrar           | Untouched                                                   |
| Live menu / order  | Popmenu (`www.mcflamingo.com`) | Linked as origin of truth                                   |
| Continuity map     | Pixel tip `CONT-<digest>`      | Proves which artifact was shone in                          |
| Continuity booth   | `/continuity/booth/$domain`    | Settles PIX while Continuity is live                        |
| Till fees          | Pixel UTXOs when `origin_dark` | Ops mark or origin health probe                             |
| Cross-phone invite | Invite pack or node ops store  | Desk **Copy invite pack** / `GET /continuity/invite/:token` |
| Order webhook      | Pixel node + shared secret     | `POST /continuity/order` → `handleContinuityOrder`          |

## Discipline line (always pair usefulness with Pixel)

> Settlement and the Continuity map live on Pixel. Your live menu can still open on your host — Pixel does not host the internet.

If a pitch only says “your menu stays up,” add that sentence.

## What operators can do now

1. Shine in / go live → digest anchored on Pixel
2. **Copy invite pack (cross-phone)** — merchant pastes pack on join page if ops aren’t on their device yet
3. Or run a Pixel node, `PUT /continuity/ops` with `CONTINUITY_WEBHOOK_SECRET`, then `GET /continuity/invite/:token`
4. **Check origin health** on `/continuity` — failed probe → mark `origin_dark` (ops flip, not DNS)
5. Customers **Pay with Pixel** at the Continuity booth
6. Point Popmenu/Toast at `POST /continuity/order` with header `X-Continuity-Secret` (or `Authorization: Bearer …`) when ready

```bash
export CONTINUITY_WEBHOOK_SECRET=your-lab-secret
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001
# PUT ops, then:
curl -s -X POST http://127.0.0.1:8545/continuity/order \
  -H "content-type: application/json" \
  -H "x-continuity-secret: $CONTINUITY_WEBHOOK_SECRET" \
  -d '{"storeDomain":"www.mcflamingo.com","amountPix":200,"via":"popmenu"}'
```

## What is still operator homework

- Pointing DNS / CDN failover at Continuity mirrors (your registrar / LB — Continuity checklist only)
- Configuring Popmenu/Toast dashboard to hit the webhook URL + secret
- Gate J public chaos drill evidence

Do not tell merchants “Pixel hosts your site” or “DNS is flipped.” Tell them: map + till on Pixel; checkout booth / webhook settles PIX; live food still opens on Popmenu.

# Continuity desk — sell the ladder (lab)

**For:** you as operator (sales + health).  
**Not yet:** fully agentic rsync/DNS — that comes after this wizard works by hand.

## Run

```bash
bun run dev
```

Open:

- Admin: [http://localhost:8080/continuity](http://localhost:8080/continuity)
- From Lab: **Continuity desk →**

## Admin steps (1–5)

1. **Create offer** — business name, domain, price
2. **Copy secure link** — send to the merchant
3. **Merchant joins** — they open `/continuity/join/<token>`, upload/paste snapshot → digest
4. **Assign rungs** — pick which of your 5 mirror base URLs serve them
5. **Go live** — shines digest into SISO (`in_the_light`) and opens a **deploy checklist** (rsync/DNS hints). Tick boxes as you (or a future agent) finish each job.

## Merchant experience

Secure link only. Confirm origin + digest. No admin chrome.

## CLI hardening

`pixel send --to` now requires a real `pix1` + 38 hex address (rejects placeholders like `PASTE_BOB_ADDRESS_HERE`).

## Money shape

You charge ~$15–30/mo. Rungs cost you VPS. Pixel = map (digest) + later till.  
See conversation thesis: toll on map/till, not forever landlord of every booth.

## Tests

```bash
bun run test:continuity-ops
```

## Next (agentic)

Secure link that also: pulls export, rsyncs to rungs, configures failover — so sales only shares a link and you watch health.

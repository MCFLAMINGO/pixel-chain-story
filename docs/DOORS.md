# Doors — how to build on, with, or use Pixel

**Purpose:** Pixel Ledger is a light-settlement picture. Scarce PIX settle under Proof of Light Sequence. Light reveals; without it, color is absent. Shine existence and value onto one shared picture — verification, continuity, or custody — not metaphor alone.

**Not:** host the internet, Visa, a second Facebook, or “USD with a new name.”

Live map: **`/doors`** on the site.

---

## Three builder doors (same ledger)

| Door            | Meaning                                              | Start                                                           |
| --------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| **On**          | Build apps / settlement _on_ Pixel                   | [`BUILDERS.md`](./BUILDERS.md) Path A · `/lab`                  |
| **For**         | Strengthen the protocol _for_ Pixel                  | [`PATH.md`](./PATH.md) · [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| **Into (SISO)** | Shine an existing site/app _into_ Pixel — no rewrite | [`CONTINUITY-SISO.md`](./CONTINUITY-SISO.md) · `/shine`         |

Copy: **Build on · for · into Pixel.**

---

## People doors (use)

| Door                | What you do                                          | Route / doc                                              |
| ------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| **See the picture** | Watch the live field illuminate                      | `/`                                                      |
| **Shine in**        | Keep a brand/site reachable in the Continuity map    | `/shine`                                                 |
| **Pay with Pixel**  | Settle at a Continuity booth when it matters         | `/continuity/booth/$domain`                              |
| **Kindle**          | Presence-bound spend (lab)                           | `/lab` · [`KINDLING.md`](./KINDLING.md)                  |
| **World → PIX**     | Lock world value → shine in (lab rails)              | `/lab` Worldlight · [`LOCK-FEEDER.md`](./LOCK-FEEDER.md) |
| **Invite only**     | SMS/USSD/voice invite Kindling — never spend for you | [`ACCESS.md`](./ACCESS.md)                               |

Hold / pay: Kindling + your Source. Cash in/out: lock → shine (receipt outside, vault inside). Site alive in the picture: Continuity / SISO.

Custody law: pay face ≠ vault; grid is optional code codec — [`CUSTODY.md`](./CUSTODY.md).

---

## Seed the mind (advantageous uses — invent, not claims)

Ideas to explore. Ship only with PATH evidence.

1. **Continuity for any origin** — menu, clinic portal, village site: digest on Pixel; mirrors when host blinks.
2. **Booth till** — when origin is dark, Pay with Pixel still settles; till accrues for the merchant.
3. **Presence spend** — two lit faces meet; no phishing SMS debit.
4. **Agnostic shine-in** — USDC today, other locks later; Pixel stays the settlement picture.
5. **Agents shine in** — MCP/tools register as LightArtifacts; no rewrite VM ([`AGENTS-SISO.md`](./AGENTS-SISO.md)).
6. **Energy Truth** — show settlement cost vs datacenter thirst when you illuminate.
7. **Field / tip custody** — scene continuity (peer field) so the tip isn’t a lonely hash rename.
8. **Lumen programs** — light vocabulary that moves real UTXOs ([`LUMEN.md`](./LUMEN.md)).

Forbidden seeds: “Pixel replaces AWS,” “flashlight = cryptography,” “screenshot wallet = custody,” “production bridge live” without Gate evidence.

---

## 15-minute start

```bash
bun install && bun run test:all
bun run pixel -- init --datadir ./data/a
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001
bun run dev
# /doors  ·  /?rpc=http://127.0.0.1:8545  ·  /lab  ·  /shine
```

Status: prototype with real tests. Claim only what `pix_protocolInfo.gates` allow.

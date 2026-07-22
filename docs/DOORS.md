# Doors — how to build on, with, or use Pixel

**Purpose:** Pixel Ledger is a light-settlement picture. Scarce PIX settle under Proof of Light Sequence. Light reveals; without it, color is absent. Shine existence and value onto one shared picture — verification, continuity, or custody — not metaphor alone.

**Not (today’s claims):** host the internet, Visa, a second Facebook, or “USD with a new name.”

Live map: **`/doors`** on the site.

---

## North star (dream ≠ claim)

**Build to meet the claim.** The dream is the goal; PATH gates are how we earn the right to say it out loud.

|                |                                                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dream**      | A world-class model for a future species: **light signatures in a dark universe** — settlement, continuity, and custody that feel like illumination, not farms and phishing. Think big. Solve big problems. |
| **Discipline** | Public voice claims only what the highest green gate allows ([`PATH.md`](./PATH.md)). Vocabulary can be large; **claims escalate with evidence**.                                                           |
| **Stance**     | Keep the honest lab frame _and_ build until the frame is obsolete.                                                                                                                                          |

Thesis strings name the destination. Tests and gates prove we arrived. Never hide a gap behind poetry — and never shrink the north star to match yesterday’s CI.

---

## Invite others (direct the light)

Pixel needs more than one brain. Two ways in:

1. **Help us build** — pick a door (**on / for / into**), land evidence, raise a PATH gate.
2. **Bring a tangential mind** — your domain (optics, villages, agents, art, energy, markets) may aim the light somewhere we have not named. Open an issue, a seed, a prototype. Direct the future; do not wait for permission to think.

Copy: _Build with us — or aim your own light into the picture._

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

Ideas to explore. Ship only with PATH evidence. Tangential brains: add yours.

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

Status: prototype with real tests. **North star:** light signatures in a dark universe. **Claim:** only what `pix_protocolInfo.gates` allow.

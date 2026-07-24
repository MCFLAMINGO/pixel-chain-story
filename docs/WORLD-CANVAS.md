# World canvas — one public picture of humanity

**Stance:** invent destination, not today’s claim. Lab notebooks prove light works; the people product is a **shared public ledger** everyone can see — not make-believe, not “init your own universe.”

---

## The feeling we owe people

Regular users need:

1. **A wallet** — something that holds their PIX / posture (phone-native). Not a datadir. Not Bun. Not “find `nodekey.json`.”
2. **Felt connection** — whatever they do should feel like it touches **the main picture**, not a private sandbox.
3. **Public truth** — the power of a blockchain is a ledger **everybody can inspect**. Pixel must keep that: settlement leaves a **mark on the tip** of the shared canvas.
4. **Ease** — open, hold, pay, shine in. Operators may run heavier gear; people never should have to.

`pixel init` on a laptop is **builder scaffolding**. It is not the onboarding myth for humanity.

---

## One dark canvas (destination model)

There is **one world picture**. It is mostly dark until light arrives.

| Image                  | Meaning                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| Canvas already there   | Shared **coordinate / genesis identity** — the grid of humanity’s settlement picture         |
| Cell unlit             | No settled state yet (superposition / void) — color absent without light                     |
| Shine                  | PoLS + presence settle a **state**; the cell becomes visible                                 |
| Proximity              | Lights discover they are neighbors in one field (network now; optical later)                 |
| Night-Earth from orbit | Sparse hamlets faint; dense activity bright — **cities of light** = dense nodes / settlement |

Nodes and wallets do not each invent a separate Bitcoin. They **illuminate regions** of the same canvas. When two lights are in proximity, they realize they were always in one picture — the other just hadn’t been seen yet.

**Mark on the tip:** every real settle, shine-in, or Kindling that counts must leave evidence on the **shared tip** (or a header/commitment that light clients can check). If it doesn’t touch the public picture, it isn’t Pixel settlement — it’s local theater.

---

## Roles (do not confuse them)

| Who                        | What they do                                               | What they never do                                                     |
| -------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| **People**                 | Hold a wallet; pay; shine existence in; see the live field | Run `init`, manage datadirs, operate sequencers                        |
| **Builders**               | Apps on / for / into Pixel; invent custody & UX            | Sell CLI genesis as “your blockchain”                                  |
| **Operators / sequencers** | Keep the shared tip alive; illuminate; gossip              | Hold people’s Sources; pretend private notebooks are the public ledger |

Operators are **connected into one field** (or able to connect / converge). Separate machines, **one tip** — like night lights on one planet, not each house inventing its own Earth.

---

## People product (easy path)

```
Wallet (Personal Source / pay face)
    → joins the public tip (RPC / light client / hosted feed)
    → Kindling / pay / Continuity leave a tip mark
    → Live field (/) shows the same picture humanity sees
```

| Must feel like                      | Must not feel like                   |
| ----------------------------------- | ------------------------------------ |
| “I’m on the chain everyone can see” | “I lit a notebook only I understand” |
| Wallet holds value                  | Seed screenshot / folder archaeology |
| Bridge when I need world money      | Forced to become a node operator     |
| My act brightened the map           | My act vanished into localStorage    |

Custody law still holds: pay face ≠ vault; grid is optional codec ([`CUSTODY.md`](./CUSTODY.md)).

---

## Lab vs regime (honest)

| Today (lab — allowed)                              | Destination (not claimed yet)                          |
| -------------------------------------------------- | ------------------------------------------------------ |
| Anyone can `init` a local genesis                  | One (or few) **public canvas genesis** everyone joins  |
| `data/a` holds your builder keys                   | People wallet; operators run shared tip infrastructure |
| Multi-host join in demos                           | Always-on discovery / proximity → one field            |
| Billboard may forge throwaway genesis for look-dev | Billboard = **the** public tip feed                    |
| Continuity / Kindling often same-browser           | Tip-anchored, publicly verifiable marks                |

**Forbidden marketing:** “Everyone inits, then we magically merge into one Bitcoin.”  
**Allowed dream:** “One canvas; wallets shine into it; the tip is humanity’s mark.”

---

## Build order (toward ease + one picture)

1. [x] **People wallet surface (lab)** — `/wallet`: forge / unlock / tip balance without CLI; pay face ≠ vault (`people-wallet.ts`, `test:wallet`). Device localStorage; not yet default public tip.
2. [x] **Billboard honesty** — `/` labels **lab light** vs **public tip** (`?rpc=` / `VITE_PIXEL_RPC`). Throwaway browser genesis is never called the shared picture.
3. [~] **Canonical tip feed** — operator recipe + `VITE_PIXEL_RPC` ([`CANONICAL-TIP.md`](./CANONICAL-TIP.md)); people pay via `POST /tx` → `shared_tip` (`attachTransferViaRpc`, `test:shared-tip`). Still open: always-on hosted public tip as production default.
4. [x] **Tip mark discipline (lab)** — Continuity digests, Kindling settles, booth pays return `TipMarkReceipt` with attachment plane (`lab_local` | `node_sidecar` | `shared_tip`). Go live binds booth session to the **same** canvas as the map tip. Foreign canvas settles refuse. Shared tip attach when RPC present (`tip-mark.ts`, `test:tip-mark`, `test:shared-tip`).
5. [x] **Canvas identity (lab)** — `CanvasId = (networkId, genesisHash)`; `/health` + `/sync` + headers expose `genesisHash`; `pix_canvasId` RPC; Billboard shows canvas when live (`canvas-id.ts`).
6. [ ] **Proximity / discovery** — peers and (later) optical presence converge into one field; brightness as activity truth, not fake physics.
7. [ ] **PATH gates** — claim “public shared tip” and “people wallet” only when evidence is green ([`PATH.md`](./PATH.md)).

---

## Why this matters

Blockchain’s power is **public, shared, not make-believe**.  
Pixel’s invent is **light on that public picture** — wallets for people, operators keeping the tip alive, every real act a mark the world can see.

If it doesn’t resonate on the main tip, it isn’t the picture of humanity yet — it’s still a private lamp. We keep building until the lamp and the planet are the same light.

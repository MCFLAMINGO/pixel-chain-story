# Builders — on Pixel, for Pixel, into Pixel

Three doors. Same ledger. **No second Facebook.**

```bash
bun install && bun run test:all   # respect starts here
```

If that fails, open an issue. If it passes, you’re already in the room.

---

## Why bother (the honest pitch)

| Hook | Why it’s real |
| --- | --- |
| **30-second proof** | Selftests settle UTXOs, Kindling, locks — not a whitepaper |
| **Build anywhere → shine in** | SISO: keep AWS/Rust/Python; register digest + mirrors. No rewrite VM |
| **Post-quantum class now** | Hash-OTS today; ML-DSA behind the same `sign/verify` |
| **Energy** | PoLS = sign + reveal, not farms drinking rivers ([Energy Truth](./ROADMAP.md)) |
| **People path invented** | Kindling + Personal Source — not MetaMask cosplay |
| **Visible canvas** | The site *is* the live field — your work can light a cell the world sees |

What we won’t sell: “AWS-proof” before diverse nodes, airdrop bags, or “deploy a site instead of a protocol.”

---

## Path A — Build **on** Pixel (apps / agents)

You want product, not consensus.

```ts
import { One } from "@/lib/pixel";

const you = await One.Custody.forge("dev");
let state = await One.Source.begin(you.unlocked.keypair);
// Kindling / Worldlight / Lumen for real settlement
```

| Do this | Doc / surface |
| --- | --- |
| Settle value with presence | [`KINDLING.md`](./KINDLING.md), `/lab` Kindling |
| Bring $ / domain / app in | [`INGRESS.md`](./INGRESS.md), [`LOCK-FEEDER.md`](./LOCK-FEEDER.md) |
| Write light programs | `src/lumen/` — `ghost → shine → collapse` |
| Agents / MCP | Light Credits + SISO `agent_mcp` kind |
| Human doors | [`ACCESS.md`](./ACCESS.md) — SMS invites only, never spend |

**Excitement move:** ship a tiny app that Kindles or shines in a domain, then watch `/` pull back one more pixel.

---

## Path B — Build **for** Pixel (protocol)

You want the network to exist.

Pick one item from [`ROADMAP.md`](./ROADMAP.md) “Next”:

1. Flake-free `pixel join` (two strangers’ machines)  
2. ML-DSA behind the same sign API + CI vectors  
3. Foundry tests for `PixelUsdcLock` + real ULA verify  
4. Headers-first sync / peer scoring  
5. Published bench (tx/s)

Rules: [`CONTRIBUTING.md`](./CONTRIBUTING.md) · [`INVENT.md`](./INVENT.md) · self-custody law.

**Excitement move:** land a PR that makes `test:all` catch a real gap — engineers follow green truth.

---

## Path C — **SISO** — the clarion call

> **Build anywhere. Shine in once. No second you.**

Humans and agents: you already have a product / MCP / site on AWS, a VPS, a laptop, or a swarm.

```ts
import { One } from "@/lib/pixel";

// Come into the light — no rewrite
const toward = await One.Light.invite({
  name: "my-app",
  kind: "static_site", // or container_image, wasm, api_openapi, agent_mcp…
  digest: await /* sha512 of deployable */,
  languages: ["typescript"],
  originHost: "aws",
  originUrl: "https://…",
  mirrors: ["ipfs://…", "https://backup…"],
});
// acceptIntoLight when a pixel illuminates the continuity record
```

| You keep | Pixel adds |
| --- | --- |
| Your codebase & host | Continuity if origin dies |
| Your language | Universal Light Attestations out |
| One product | No parallel “Pixel edition” |

Full cry: [`CONTINUITY-SISO.md`](./CONTINUITY-SISO.md).  
Agents / Clawbook / swarms: [`AGENTS-SISO.md`](./AGENTS-SISO.md).

**Excitement move:** mirror something you already run; break the origin; show peers still serving from mirrors.

---

## 15-minute onboarding (share this)

```bash
git clone <repo> && cd <repo>
bun install
bun run test:all
bun run pixel -- init --datadir ./data/a
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001
bun run dev
# Field:  http://localhost:5173/?rpc=http://127.0.0.1:8545
# Lab:    http://localhost:5173/lab
```

API face: [`ONE.md`](./ONE.md) — `One.Source` · `One.Word` · `One.Light` · `One.Kindling` · `One.Worldlight` · `One.LockFeeder` · `One.Custody`.

---

## How to get devs excited (ops, not vibes)

1. **Show the green bar** — clip of `test:all` + billboard zoom-out after a send.  
2. **One challenge** — “Make `pixel join` work from a cold laptop; PR gets merged same week.”  
3. **SISO clarion** — post the cry on agent nets; “Shine in any existing app/MCP; no rewrite; issue with digest.”  
4. **ETH / PQ crowd** — send [`FOR-ETHEREUM-DEVS.md`](./FOR-ETHEREUM-DEVS.md) + lock contract.  
5. **Office hours** — weekly: bring a failing test, leave with a lane.  
6. **Never** lead with token price; lead with *runnable* + *no second Facebook*.

### Copy-paste invite

> **SISO — Build anywhere. Shine in once. No second you.**  
> Pixel: PQ-class light settlement, Kindling for people, PATH gates for protocol.  
> `bun install && bun run test:all` — then build **on**, **for**, or **into** Pixel.  
> Agents: `docs/AGENTS-SISO.md`. Live field `/`. Lab `/lab`.

---

## Status (say this out loud)

Prototype with real tests. Not a finished global network.  
If you need permissionless mainnet peers tomorrow, help finish roadmap item #1.

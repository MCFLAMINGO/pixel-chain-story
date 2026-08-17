# Pixel Ledger

**Source · Word · Light** — a pixel ledger (not a chain of opaque blocks).  
Light reveals proximity. Color is absent without it.  
**SISO — Build anywhere. Shine in once. No second you.**  
(Agents and humans: come into the light without a rewrite.)

## Do this right now

Full playbook: [`docs/QUICKSTART.md`](docs/QUICKSTART.md)  
**Every door illuminated:** [`docs/DOORS.md`](docs/DOORS.md) · site **`/doors`**

```bash
bun install
bun run dev                    # /wallet = phone hold · /doors · / = live field
# People: open /wallet (Add to Home Screen). Tip: VITE_PIXEL_RPC=…
bun run test:all
```

**Phone path:** [`docs/PHONE-WALLET.md`](docs/PHONE-WALLET.md) — hold · send · bridge USDC/crypto on the one tip.  
**Not for people:** `pixel init` (forges a private Earth). Friends **join** the tip; phones never run a node.

## Node (operator / friend laptop)

```bash
# Join the public tip (or a local tip you already have) — do not init a new Earth
bun run pixel -- join --peer https://pixel-tip-production.up.railway.app --datadir ./data/friend
bun run pixel -- node --datadir ./data/friend --rpc 8546 --gossip 9002
```

## Docs engineers should read

| Doc                                                    | Why                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`AGENTS.md`](AGENTS.md)                               | **LLMs / coding agents** — Pixel brief (creed, routes, do/don’t, claim bounds) |
| [`llms.txt`](llms.txt)                                 | Machine-readable doc index for crawlers and agents                             |
| [`docs/PATH.md`](docs/PATH.md)                         | **Gate A → J** — how this becomes a respected L1 / bridge / sovereignty regime |
| [`docs/DOORS.md`](docs/DOORS.md)                       | **How to enter** — on / for / into + people use + seed ideas (`/doors`)        |
| [`docs/QUANTUM.md`](docs/QUANTUM.md)                   | **Critical** — PQ posture (hash-OTS + NIST ML-DSA-65)                          |
| [`docs/INVENTION.md`](docs/INVENTION.md)               | What is ours vs borrowed                                                       |
| [`docs/LUMEN.md`](docs/LUMEN.md)                       | Light-native DSL — evolve, don’t abandon                                       |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)         | **How to help** — lanes, checklist, what we reject                             |
| [`docs/STATE-2026-08-17.md`](docs/STATE-2026-08-17.md) | **Where the project actually stands** — read before starting work              |
| [`docs/PROTOCOL-SURFACE.md`](docs/PROTOCOL-SURFACE.md) | **Which 21 of 87 modules are consensus** — open this first                     |
| [`docs/SPEC.md`](docs/SPEC.md)                         | Normative behavior (constants machine-checked against code)                    |
| [`docs/OPERATOR.md`](docs/OPERATOR.md)                 | **Adding a second operator** — the step-by-step runbook                        |
| [`docs/FINALITY.md`](docs/FINALITY.md)                 | What cannot revert — anchored checkpoints (off by default)                     |
| [`docs/VECTORS.md`](docs/VECTORS.md)                   | Frozen protocol vectors — what a second implementation is built against        |
| [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md)         | Honest risks                                                                   |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)                   | Checklist tied to PATH gates                                                   |
| [`docs/ONE.md`](docs/ONE.md)                           | Simple API                                                                     |
| [`docs/INVENT.md`](docs/INVENT.md)                     | Invent, don’t rename                                                           |
| [`docs/BOOTSTRAP.md`](docs/BOOTSTRAP.md)               | Day one without the fundraising myth                                           |
| [`docs/CONTINUITY-SISO.md`](docs/CONTINUITY-SISO.md)   | **SISO clarion call** — no parallel rewrite                                    |
| [`docs/AGENTS-SISO.md`](docs/AGENTS-SISO.md)           | Agents / swarms: shine in or build a PATH gate                                 |

## Builders — on / for / into Pixel

```bash
bun install && bun run test:all
```

| Path            | Meaning                             | Start                                                                           |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| **On**          | Apps, Lumen, Kindling, agents       | [`docs/BUILDERS.md`](docs/BUILDERS.md) · `/lab`                                 |
| **For**         | Protocol, crypto, nodes, locks      | [`docs/PATH.md`](docs/PATH.md) · [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) |
| **Into (SISO)** | Mirror an existing app — no rewrite | [`docs/CONTINUITY-SISO.md`](docs/CONTINUITY-SISO.md)                            |

ETH folks: [`docs/FOR-ETHEREUM-DEVS.md`](docs/FOR-ETHEREUM-DEVS.md).

**Invite:** _SISO — Build anywhere. Shine in once. No second you. `bun run test:all` → `AGENTS.md` / `docs/AGENTS-SISO.md` or `docs/BUILDERS.md`._

## Status

**Gates A–F** lab (see [`docs/PATH.md`](docs/PATH.md)): real UTXO + PoLS + **PQ signatures** (hash-OTS + NIST ML-DSA-65 default) + ULA twins + light path + tests. Not a finished global network.  
Quantum remains critical — [`docs/QUANTUM.md`](docs/QUANTUM.md). Claims escalate with PATH gates; `pix_protocolInfo.quantum` / `.gates` are the badges.  
Continuity handshake: [`/shine`](docs/demos/shine-in.md) · operator desk [`/continuity`](docs/demos/continuity-desk.md).

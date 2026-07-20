# Pixel Ledger

**Source · Word · Light** — a pixel ledger (not a chain of opaque blocks).  
Light reveals proximity. Color is absent without it.  
**SISO — Build anywhere. Shine in once. No second you.**  
(Agents and humans: come into the light without a rewrite.)

## Do this right now

Full playbook: [`docs/QUICKSTART.md`](docs/QUICKSTART.md)

```bash
bun install
bun run pixel -- init --datadir ./data/a
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001
bun run dev                    # site = live field at /  (add ?rpc=http://127.0.0.1:8545)
# /lab = Kindling / Worldlight for builders
bun run test:all
```

## Node (local)

```bash
bun run pixel -- init --datadir ./data/a
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001
# other terminal
bun run pixel -- join --peer http://127.0.0.1:8545 --datadir ./data/b
bun run pixel -- node --datadir ./data/b --rpc 8546 --gossip 9002 --seed ws://127.0.0.1:9001/gossip
```

## Docs engineers should read

| Doc | Why |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | **LLMs / coding agents** — Pixel brief (creed, routes, do/don’t, claim bounds) |
| [`llms.txt`](llms.txt) | Machine-readable doc index for crawlers and agents |
| [`docs/PATH.md`](docs/PATH.md) | **Gate A → J** — how this becomes a respected L1 / bridge / sovereignty regime |
| [`docs/QUANTUM.md`](docs/QUANTUM.md) | **Critical** — PQ posture (hash-OTS + NIST ML-DSA-65) |
| [`docs/INVENTION.md`](docs/INVENTION.md) | What is ours vs borrowed |
| [`docs/LUMEN.md`](docs/LUMEN.md) | Light-native DSL — evolve, don’t abandon |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | **How to help** — lanes, checklist, what we reject |
| [`docs/SPEC.md`](docs/SPEC.md) | Normative behavior |
| [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) | Honest risks |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Checklist tied to PATH gates |
| [`docs/ONE.md`](docs/ONE.md) | Simple API |
| [`docs/INVENT.md`](docs/INVENT.md) | Invent, don’t rename |
| [`docs/BOOTSTRAP.md`](docs/BOOTSTRAP.md) | Day one without $21M myth |
| [`docs/CONTINUITY-SISO.md`](docs/CONTINUITY-SISO.md) | **SISO clarion call** — no parallel rewrite |
| [`docs/AGENTS-SISO.md`](docs/AGENTS-SISO.md) | Agents / swarms: shine in or build a PATH gate |

## Builders — on / for / into Pixel

```bash
bun install && bun run test:all
```

| Path | Meaning | Start |
| --- | --- | --- |
| **On** | Apps, Lumen, Kindling, agents | [`docs/BUILDERS.md`](docs/BUILDERS.md) · `/lab` |
| **For** | Protocol, crypto, nodes, locks | [`docs/PATH.md`](docs/PATH.md) · [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) |
| **Into (SISO)** | Mirror an existing app — no rewrite | [`docs/CONTINUITY-SISO.md`](docs/CONTINUITY-SISO.md) |

ETH folks: [`docs/FOR-ETHEREUM-DEVS.md`](docs/FOR-ETHEREUM-DEVS.md).

**Invite:** *SISO — Build anywhere. Shine in once. No second you. `bun run test:all` → `AGENTS.md` / `docs/AGENTS-SISO.md` or `docs/BUILDERS.md`.*

## Status

**Gates A–F** lab (see [`docs/PATH.md`](docs/PATH.md)): real UTXO + PoLS + **PQ signatures** (hash-OTS + NIST ML-DSA-65 default) + ULA twins + light path + tests. Not a finished global network.  
Quantum remains critical — [`docs/QUANTUM.md`](docs/QUANTUM.md). Claims escalate with PATH gates; `pix_protocolInfo.quantum` / `.gates` are the badges.  
Continuity handshake: [`/shine`](docs/demos/shine-in.md) · operator desk [`/continuity`](docs/demos/continuity-desk.md).

# Pixel Ledger

**Source · Word · Light** — a pixel ledger (not a chain of opaque blocks).  
Light reveals proximity. Color is absent without it.  
Build anywhere; come into the light via SISO — no second Facebook.

## Prove it in one command

```bash
bun install
bun run test:all
```

Runs settlement, L1 multi-node accept, economics/sovereignty/bridge, SISO continuity, and the One API.

## Node (local)

```bash
bun run pixel init --datadir ./data/a
bun run pixel node --datadir ./data/a --rpc 8545 --gossip 9001
# other terminal
bun run pixel join --peer http://127.0.0.1:8545 --datadir ./data/b
bun run pixel node --datadir ./data/b --rpc 8546 --gossip 9002 --seed ws://127.0.0.1:9001/gossip
```

## Docs engineers should read

| Doc | Why |
| --- | --- |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | **How to help** — lanes, checklist, what we reject |
| [`docs/SPEC.md`](docs/SPEC.md) | Normative behavior |
| [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) | Honest risks |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What earns respect next |
| [`docs/ONE.md`](docs/ONE.md) | Simple API |
| [`docs/INVENT.md`](docs/INVENT.md) | Invent, don’t rename |
| [`docs/BOOTSTRAP.md`](docs/BOOTSTRAP.md) | Day one without $21M myth |
| [`docs/CONTINUITY-SISO.md`](docs/CONTINUITY-SISO.md) | No parallel rewrite |

## Help build

```bash
bun install && bun run test:all
```

Then pick a lane in [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) (protocol, crypto, Solidity, lock feeder, field pilot, design, or run a sovereign node). Open a small PR with a selftest.

## Status

Prototype ledger with real tests. Not a finished global network. See roadmap.

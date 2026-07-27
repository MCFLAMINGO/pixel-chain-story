# Two-node Pixel network (Gate B)

Prove two hosts share one tip: join via `/sync`, gossip live transfers both ways.

**Evidence:** `bun run test:net` (spawns two real node processes).

**Friends inviting humans:** use the crowned public tip — [`friend-invite.md`](./friend-invite.md).  
Do **not** teach `pixel init`.

## Local lab (one machine, two terminals)

```bash
# Terminal A — lab throwaway Earth (CI/demo only)
PIXEL_ALLOW_LAB_GENESIS=1 bun scripts/lab-forge-datadir.ts --datadir ./data/a
bun run pixel -- wallet from-node sequencer --datadir ./data/a
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001 --advertise 127.0.0.1
```

```bash
# Terminal B — join snapshot, then dial gossip
bun run pixel -- join --peer http://127.0.0.1:8545 --datadir ./data/b
bun run pixel -- node --datadir ./data/b --rpc 8546 --gossip 9002 \
  --seed ws://127.0.0.1:9001/gossip --advertise 127.0.0.1
```

## Public tip (recommended)

```bash
bun run pixel -- join --peer https://pixel-tip-production.up.railway.app --datadir ./data/b --require-crowned
bun run pixel -- node --datadir ./data/b --rpc 8546 --gossip 9002
```

Confirm genesis starts with `f1d193f62d54e982`.

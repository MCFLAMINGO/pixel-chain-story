# Two-node Pixel network (Gate B)

Prove two hosts share one tip: join via `/sync`, gossip live transfers both ways.

**Evidence:** `bun run test:net` (spawns two real node processes).

## Local (one machine, two terminals)

```bash
# Terminal A — genesis + illuminator
bun run pixel -- init --datadir ./data/a
bun run pixel -- wallet from-node sequencer --datadir ./data/a
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001 --advertise 127.0.0.1
```

```bash
# Terminal B — join snapshot, then dial gossip
bun run pixel -- join --peer http://127.0.0.1:8545 --datadir ./data/b
bun run pixel -- node --datadir ./data/b --rpc 8546 --gossip 9002 \
  --seed ws://127.0.0.1:9001/gossip --advertise 127.0.0.1
```

Check:

```bash
curl -s http://127.0.0.1:8545/health | jq '{pixels,peers,gossipUrl,gate}'
curl -s http://127.0.0.1:8546/health | jq '{pixels,peers,gossipUrl,gate}'
```

Both should show the same `pixels` count after a transfer. Submit a signed tx with `POST /tx` (see `scripts/net-selftest.ts`) or use `bun run pixel -- send …` against the running illuminator’s datadir.

## Two VPS

1. **VPS A** (public IP or DNS `A_HOST`): open RPC + gossip ports (e.g. 8545, 9001).
2. Init and run with **advertise = public address** (not `127.0.0.1`):

```bash
bun run pixel -- init --datadir ./data/a
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001 --advertise A_HOST
```

3. **VPS B**:

```bash
bun run pixel -- join --peer http://A_HOST:8545 --datadir ./data/b
bun run pixel -- node --datadir ./data/b --rpc 8546 --gossip 9002 \
  --seed ws://A_HOST:9001/gossip --advertise B_HOST
```

`join` pulls `/sync` (pixels + sequencers + `gossipUrl`) and saves the gossip seed into the peer book. Nodes reconnect with backoff if the socket drops, and periodically `get_pixels` for hole-fill.

## Stall detection (Gate B) → skip (Gate C)

If mempool has pending txs and the tip is silent past `stallCheckMs` / `POLS_STALL_MS` (default 15s), a standby sequencer may illuminate with `skipCount ≥ 1`. Peers accept only after the stall window; fork-choice prefers lower skip at the same height. See SPEC §4.1 and `bun run test:fault`.

## What Gate B does *not* claim

- No peer authentication / eclipse resistance (Gate F)
- Stall detection **warns + catch-up**; sequencer skip/replace is Gate C
- Not “BFT mainnet” — multi-host prototype tip extension only

## Automated proof

```bash
bun run test:net
```

Expect: join via `/sync`, peers linked, tip advances on both nodes for A→B and B→A gossip paths.

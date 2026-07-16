# Do this right now

Honest status: **local prototype**. You are not joining a global mainnet yet — you light a ledger on your machine (and optionally a second peer).

## A. Fastest — UI playground

```bash
bun install
bun run dev
```

Open the site:

| Section | What you do |
| --- | --- |
| **Worldlight** | Lock $5 USDC (local rail) or bank wire → PIX on a Personal Source |
| **Kindling** | Offer → accept → meet in light → unlock & settle |
| **Access** | SMS/USSD **invites only** (cannot spend) |
| **`/billboard`** | Full-screen field — Times Square style; add `?rpc=http://127.0.0.1:8545` for a live node |

## B. You are the sequencer (CLI)

Genesis **50 PIX** go to the **node key**, not a random new wallet.

```bash
bun install

# 1) Create ledger + you become genesis sequencer
bun run pixel -- init --datadir ./data/a

# 2) Use that sequencer identity as a wallet (holds the 50 PIX)
bun run pixel -- wallet from-node sequencer --datadir ./data/a

# 3) Make a friend wallet
bun run pixel -- wallet create bob --datadir ./data/a
# copy bob's pix1… address from the output

# 4) Send + illuminate (paint the next pixel, earn another light reward)
bun run pixel -- send --from sequencer --to pix1…bob --amount 10 --datadir ./data/a

# 5) Check
bun run pixel -- balance --wallet bob --datadir ./data/a
bun run pixel -- balance --wallet sequencer --datadir ./data/a
```

### Keep a node running (RPC + gossip)

```bash
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001
```

Second terminal — join as another sequencer peer (still local/demo networking):

```bash
bun run pixel -- join --peer http://127.0.0.1:8545 --datadir ./data/b
bun run pixel -- node --datadir ./data/b --rpc 8546 --gossip 9002 --seed ws://127.0.0.1:9001/gossip
```

## C. Prove the protocol without a UI

```bash
bun run test:all
```

Includes settlement, Kindling, Worldlight, lock feeder, bootstrap.

## What “run a sequencer” means today

1. `init` creates a **Personal Source–style node key** and paints genesis (50 PIX to you).  
2. When you `send` (or the running `node` auto-sequences), if it is your turn you **illuminate** — new pixel, light reward.  
3. There is **no public sequencer marketplace** yet — your machine *is* the set.

## Not available as one click yet

- Public shared network / other people’s sequencers on the internet  
- Live mainnet USDC (local rail + Solidity contract exist; deploy/relayer is next)  
- SMS gateway to a phone in Bangladesh (invite parser exists; aggregator not plugged in)

## Next docs

- [`BOOTSTRAP.md`](./BOOTSTRAP.md) — why you don’t need $21M  
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — help harden `node/join` and feeders  

# Do this right now

**People:** phone wallet on the crowned tip.  
**Friends:** join that tip on a laptop — never `pixel init`.

## A. Phone wallet (invite this)

1. Open the site → **`/wallet`**
2. Add to Home Screen
3. Create wallet → **Fund tip** → Bridge USDC or Send PIX
4. Confirm tip genesis starts with **`f1d193f62d54e982`**

Discord paste: [`demos/friend-invite.md`](./demos/friend-invite.md) · bot: [`demos/discord-bot.md`](./demos/discord-bot.md)

## B. Friend node (laptop / VPS) — witness

```bash
git clone https://github.com/MCFLAMINGO/pixel-chain-story
cd pixel-chain-story
bun install
bun run pixel -- join --peer https://pixel-tip-production.up.railway.app --datadir ./data/friend --require-crowned
bun run pixel -- node --datadir ./data/friend --rpc 8546 --gossip 9002
```

A joining node **follows and verifies**; it does not take turns producing pixels.
That is deliberate. Sequencer membership is not yet carried by the chain, so a
node that joined the rota would reject the tip's blocks and freeze at whatever
height it synced to (`scripts/electable-drift-selftest.ts` reproduces it).

Witnessing is not a consolation prize. `docs/ANCHORING.md` states that catching a
false-but-immutable anchored root needs an independent archive to compare
against — witnesses are that archive, and there is currently exactly one copy of
this history.

Taking turns is opted into with `PIXEL_SEQUENCER=1`, with the above consequence.

## B2. Hold a copy of the picture (anyone, 30 seconds)

You do not need to run a node to make the chain harder to lose. Ask an operator for a
backup file and check it:

```bash
bun run pixel -- restore --in picture.json --datadir ./data/copy
```

Restoring **replays every pixel** before it writes anything, so this also tells you
whether the file you were given is any good. A backup nobody has restored is not a
backup.

Operators write one with:

```bash
bun run pixel -- backup --datadir ./data/tip --out picture.json
```

That file is history only and safe to hand to anyone — the more people hold it, the
harder the chain is to lose. A restored history-only node serves and verifies under its
own fresh address; it cannot extend the chain.

`--include-key` also packages the sequencer key, which **can** extend the chain. Give
that only to somebody you would trust to sequence, and send it privately.

## C. Local tip (operators)

```bash
bun run tip:host
# optional: PIXEL_BRIDGE_LAB=1 PIXEL_FAUCET=1 already default in Dockerfile.tip
```

Site local against your tip:

```bash
VITE_PIXEL_RPC=http://127.0.0.1:8545 bun run dev
```

## D. Prove the protocol

```bash
bun run test:all
```

## Forbidden for friends

```bash
bun run pixel -- init   # refused — forges a private Earth
```

Lab CI only: `PIXEL_ALLOW_LAB_GENESIS=1 bun scripts/lab-forge-datadir.ts`

## Next docs

- [`PHONE-WALLET.md`](./PHONE-WALLET.md) — hold · send · bridge
- [`demos/friend-invite.md`](./demos/friend-invite.md) — Discord paste
- [`CANONICAL-TIP.md`](./CANONICAL-TIP.md) — tip ops
- [`BRIDGE-STATUS.md`](./BRIDGE-STATUS.md) — Gate E honesty

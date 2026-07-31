# Do this right now

**People:** phone wallet on the crowned tip.  
**Friends:** join that tip on a laptop — never `pixel init`.

## A. Phone wallet (invite this)

1. Open the site → **`/wallet`**
2. Add to Home Screen
3. Create wallet → **Fund tip** → Bridge USDC or Send PIX
4. Confirm tip genesis starts with **`f1d193f62d54e982`**

Discord paste: [`demos/friend-invite.md`](./demos/friend-invite.md) · bot: [`demos/discord-bot.md`](./demos/discord-bot.md)

## B. Friend node (laptop / VPS)

```bash
bun install
bun run pixel -- join --peer https://pixel-tip-production.up.railway.app --datadir ./data/friend --require-crowned
bun run pixel -- node --datadir ./data/friend --rpc 8546 --gossip 9002
```

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

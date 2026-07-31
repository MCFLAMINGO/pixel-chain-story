# Friend invite — one Earth, phone wallet, laptop join

Copy the **Discord paste** below — or run the invite bot (`/pixel join|tip|wallet`): [`discord-bot.md`](./discord-bot.md).

Full ops: [`PHONE-WALLET.md`](../PHONE-WALLET.md) · [`CANONICAL-TIP.md`](../CANONICAL-TIP.md).

---

## Discord paste (copy all)

```
PIXEL — join the one tip (not your own chain)

Phone (everyone):
1. Open the site → /wallet
2. Add to Home Screen (Safari Share → Add to Home Screen)
3. Create wallet → Unlock → Fund tip (faucet) → Bridge USDC / Send PIX
4. Tip must show genesis starting with: f1d193f62d54e982
   Public tip: https://pixel-tip-production.up.railway.app

Laptop / always-on friend (Second Satoshi — not phone):
  bun install
  bun run pixel -- join --peer https://pixel-tip-production.up.railway.app --datadir ./data/friend --require-crowned
  bun run pixel -- node --datadir ./data/friend --rpc 8546 --gossip 9002

Confirm after join:
  genesis starts with f1d193f62d54e982
  networkId 20553

NEVER run: pixel init
That forges a private notebook, not Pixel.
Phone = wallet only. Laptop = joined node.
```

---

## Operator checklist (you)

1. Lovable / site build env:
   ```
   VITE_PIXEL_RPC=https://pixel-tip-production.up.railway.app
   VITE_REQUIRE_PUBLIC_TIP=1
   ```
   (Repo also defaults `/wallet` to the public tip if env is missing.)

2. Railway tip (`pixel-tip`):
   ```
   PIXEL_BRIDGE_LAB=1
   PIXEL_FAUCET=1
   ```
   Volume at `/data/pixel` — do not wipe (new Earth).

3. Smoke:
   ```bash
   curl -s https://pixel-tip-production.up.railway.app/health | jq .genesisHash,.bridgeLab,.faucet
   # genesisHash starts with f1d193f62d54e982
   ```

---

## What friends should feel

| Who | Door |
| --- | --- |
| Phone | `/wallet` — Hold · Send · Bridge |
| Always-on friend | `join` crowned tip → `node` |
| Nobody | `pixel init` |

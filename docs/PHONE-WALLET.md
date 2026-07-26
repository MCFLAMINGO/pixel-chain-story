# Phone wallet — hold · pay · bridge

**Product law:** the phone is a **Personal Source / pay face**, not a node.  
It joins the **one public tip** over RPC. It never runs `pixel init`.

## Feel

| Move | Meaning |
| --- | --- |
| **Hold** | Sealed Source on device; pay face + tip balance |
| **Send** | Sign + `POST /tx` on the tip |
| **Bridge** | USDC / ETH (USD quote) / bank wire → shine in → PIX on your face |
| **Install** | PWA — Add to Home Screen (`/manifest.webmanifest`) |

Open: **`/wallet`** (optional `?rpc=https://…`).

## Bridge honesty

```
Lock (USDC rail / ETH quote / wire)
        ↓
shine-in prepare + illuminate
        ↓
PIX on pay face
```

- **Tip path:** tip must set `PIXEL_BRIDGE_LAB=1` → `POST /bridge/shine-in` credits the **shared tip**.
- **Fallback:** local lab rail teaches the pipe when the tip has not opened shine-in.
- **Not claimed:** mainnet USDC escrow / public Sepolia until listed in [`BRIDGE-STATUS.md`](./BRIDGE-STATUS.md).

Cap: `$25` per shine-in (`WALLET_BRIDGE_MAX_USD`).

## Ops

```bash
# Site (Lovable / Vite) — also defaults in code if unset
VITE_PIXEL_RPC=https://pixel-tip-production.up.railway.app
VITE_REQUIRE_PUBLIC_TIP=1

# Tip host (Railway) — bridge + faucet for friends
PIXEL_BRIDGE_LAB=1
PIXEL_FAUCET=1
```

Invite paste: [`demos/friend-invite.md`](./demos/friend-invite.md)

## Evidence

```bash
bun run test:wallet
bun run test:wallet-bridge
bun run test:worldlight
bun run test:lock
```

People never need Bun. Operators keep the tip alive; phones hold and bridge into it.

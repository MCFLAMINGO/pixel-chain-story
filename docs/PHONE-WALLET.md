# Phone wallet — hold · pay · bridge

**Product law:** the phone is a **Personal Source / pay face**, not a node.  
It joins the **one public tip** over RPC. It never runs `pixel init`.

## Feel

| Move | Meaning |
| --- | --- |
| **Hold** | PIN-sealed Source on device; pay face + tip balance |
| **Unlock** | Enter PIN → AES-GCM unwrap seed → ready to sign |
| **Send** | Sign + `POST /tx` on the tip |
| **Bridge** | USDC / ETH (USD quote) / bank wire → shine in → PIX on your face |
| **Install** | PWA — Add to Home Screen (`/manifest.webmanifest`) |

Open: **`/wallet`** (optional `?rpc=https://…`).

**Hardening:**
- Phase 1: PIN + PBKDF2 + AES-GCM (no plaintext seed on disk); no free lab unlock
- Phase 2: IndexedDB primary hold · idle auto-lock (~3 min) · PIN-sealed backup export/import · optional WebAuthn **PRF** Face ID / Touch ID (real unwrap — refused if PRF unavailable)
- Spends: hash-OTS (quantum-leaning). Still not hardware Keychain / FDIC.

## Bridge honesty

```
# Real(ish) — any configured EVM testnet (receipt only; Pixel settles PIX)
PixelUsdcLock.lock → tip POST /bridge/shine-in-lock → PIX

# Lab demo (still available)
POST /bridge/shine-in (PIXEL_BRIDGE_LAB=1) → PIX  # marked lab: true
```

- **EVM path:** tip sets `PIXEL_EVM_LOCK` + `PIXEL_EVM_RPC` (+ `PIXEL_EVM_CHAIN`) → `/health.bridgeEvm` → phone MetaMask or paste lock tx → verified `Locked` → PIX. Digests persisted (`bridge-feeder.json`) — no double shine. Pixel is not that L2.
- **Lab path:** `PIXEL_BRIDGE_LAB=1` → open shine-in without ethereum (friend demos).
- **Fallback:** local lab rail when tip has neither.
- **Not claimed:** Circle mainnet USDC until [`BRIDGE-STATUS.md`](./BRIDGE-STATUS.md) says so.

Cap: `$25` per shine-in (`WALLET_BRIDGE_MAX_USD`).

## Ops

```bash
# Site (Lovable / Vite) — also defaults in code if unset
VITE_PIXEL_RPC=https://pixel-tip-production.up.railway.app
VITE_REQUIRE_PUBLIC_TIP=1

# Tip host (Railway) — lab friend path
PIXEL_BRIDGE_LAB=1
PIXEL_FAUCET=1

# Tip host — EVM verified lock (after bun run deploy:evm-lock)
PIXEL_BRIDGE_EVM=1
PIXEL_EVM_CHAIN=base-sepolia   # or sepolia | amoy | arb-sepolia
PIXEL_EVM_RPC=https://sepolia.base.org
PIXEL_EVM_LOCK=0x…
PIXEL_EVM_USDC=0x…
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

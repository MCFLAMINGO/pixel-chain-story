# Canonical tip feed — how to make production `/` the shared picture

**Stance:** invent destination, not today’s claim. The people product is one shared tip everyone can see. Lab notebooks prove light; production `/` must show **that** tip.

Related: [`WORLD-CANVAS.md`](./WORLD-CANVAS.md) · tip marks · people wallet (`/wallet`).

---

## How (three steps)

```text
1. Host a durable pixel tip (HTTP RPC, persistent datadir)
2. Get a public HTTPS URL for that tip
3. Build the site with VITE_PIXEL_RPC=<that URL>
```

Until step 3 is done, `/` forges **lab light** (throwaway browser genesis). That is look-dev, not the public picture.

| Layer               | Meaning                                                             |
| ------------------- | ------------------------------------------------------------------- |
| **Canvas**          | `(networkId, genesisHash)` — join the same picture, not a new Earth |
| **Tip feed**        | `/health`, `/sync`, `/pixels`, `POST /tx` — what Billboard polls    |
| **People path**     | `/wallet` balance + pay → `shared_tip` when RPC is that tip         |
| **Not yet claimed** | Multi-operator “humanity mainnet”; a blessed global hostname        |

---

## Step 1 — Host the tip

### A. Laptop (prove it)

```bash
bun run tip:host
# RPC http://127.0.0.1:8545  ·  datadir ./data/canonical
```

Or classic CLI:

```bash
bun run pixel -- init --datadir ./data/canonical
bun run pixel -- node --datadir ./data/canonical --rpc 8545 --gossip 9001
```

### B. Docker (any VPS)

```bash
docker build -f Dockerfile.tip -t pixel-tip .
docker run -d --name pixel-tip \
  -p 8545:8545 \
  -v pixel-tip-data:/data/pixel \
  -e PORT=8545 \
  pixel-tip

curl -s http://127.0.0.1:8545/health | jq .canvasId,.tip,.genesisHash
```

Put TLS in front (Caddy / nginx / Cloudflare) → `https://tip.yourdomain.org`.

### C. Railway (always-on)

1. New Railway project → deploy from this repo with **Dockerfile path** `Dockerfile.tip`  
   (config sketch: [`railway.tip.toml`](../railway.tip.toml)).
2. Attach a **volume** at `/data/pixel` (required — wipe = new Earth).
3. Deploy → **Generate domain** → copy `https://….up.railway.app`.
4. Confirm: `curl -s https://….up.railway.app/health` shows `ok`, `genesisHash`, `tip`.

Entrypoint: `bun run tip:host` / `scripts/run-canonical-tip.ts`  
Env: `PORT` (Railway sets this), `PIXEL_DATADIR=/data/pixel`.

**Do not** deploy the Vite site as the tip. Tip = long-running node. Site = static/Lovable build that _reads_ the tip.

---

## Step 2 — Public HTTPS URL

Whatever you hosted in step 1 must answer from the public internet:

- `GET /health` → `ok: true`, `genesisHash`, `canvasId`
- `GET /sync` / `GET /pixels` → Billboard
- `POST /tx` → people pay (`test:shared-tip`)

CORS is already open on the RPC server.

---

## Step 3 — Point the site (`VITE_PIXEL_RPC`)

Vite inlines this **at build time**.

### Lovable

Project / environment variables (or the connected build settings):

```bash
VITE_PIXEL_RPC=https://YOUR-TIP-HOST
```

Redeploy the site. Open `/` — feed label should read **public tip**, not lab light. Canvas id appears under the tip counter.

### Local / CI build

```bash
VITE_PIXEL_RPC=https://YOUR-TIP-HOST bun run build
```

Override anytime: `/?rpc=https://YOUR-TIP-HOST` or `/wallet?rpc=…`.

**Honesty:** do not set `VITE_PIXEL_RPC` until the URL is a real, durable tip. A dead URL leaves Billboard on “connecting…”.

---

## Fund a people wallet (operator faucet)

After someone forges on `/wallet`, their pay face starts at 0 PIX. Lab faucet from the tip sequencer:

```bash
# same datadir as the tip host
bun run pixel -- wallet from-node faucet --datadir ./data/canonical   # or /data/pixel
bun run pixel -- send --from faucet --to <pay-face-pix…> --amount 50 --datadir ./data/canonical
```

Then **Unlock → Pay on shared tip**. Receipt attachment must be `shared_tip`.

CI evidence (no host required): `bun run test:shared-tip`.

---

## Tip-mark planes (do not confuse)

| Plane          | Where it settles                              | May claim “public tip”? |
| -------------- | --------------------------------------------- | ----------------------- |
| `lab_local`    | Browser / Continuity private genesis          | No                      |
| `node_sidecar` | Continuity session beside node                | No                      |
| `shared_tip`   | Tip from `/sync` after `POST /tx` + inclusion | Yes (that feed only)    |

---

## Checklist (done when…)

- [ ] Tip process always on; volume persists across restarts
- [ ] `curl …/health` returns stable `genesisHash` after restart (same Earth)
- [ ] Site built with `VITE_PIXEL_RPC` → `/` shows **public tip**
- [ ] `/wallet` balance + pay leave a tip mark on that canvas

PATH: claim “default public tip for humanity” only when this is the production default and evidence is green. Until then: this recipe + honest labels.

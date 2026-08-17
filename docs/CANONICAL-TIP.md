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

Tip first boot is `tip:host` (not people-facing `init`). Optional phone bridge faucet:

```bash
PIXEL_BRIDGE_LAB=1 bun run tip:host
# POST /bridge/shine-in — USDC/ETH/wire → PIX on a pay face (lab, capped)
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

### D. Second mirror / failover (required for durability)

One Railway volume is still one copy. See [`DURABILITY.md`](./DURABILITY.md).

1. On the live tip: `bun run pixel -- backup --datadir $PIXEL_DATADIR --out tip-backup.json`
2. Store that file offline **and** on a second machine (keyless by default — safe to give a friend).
3. List every public `/sync` URL in repo-root [`tip-mirrors.json`](../tip-mirrors.json).
4. Friends join with `bun run pixel -- join --public-tip --require-crowned` (tries mirrors in order).
5. If the primary dies: restore the backup onto a new host (`bun run pixel -- restore --in tip-backup.json`), start `tip:host` / `node`, update `tip-mirrors.json`, run `bun run ceremony:pack`.

Proven in CI: `bun run test:tip-failover` (lab network — dead host, live replacement, friend joins via mirrors).

Full cattle runbook (VPS cutover, USB source pack, split anchors): [`HOSTING-INDEPENDENCE.md`](./HOSTING-INDEPENDENCE.md).

Always pass `--advertise <public-host>` on any tip meant to be dialed; `/health.advertiseIsLocalhost` must be `false`.

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

## Production default gate

Lab invent (code):

| Piece                            | Role                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `probeTipHost` / `test:tip-host` | Tip feed contract: `/health` + `/sync` + `/spatial/snapshot` + `/wave/tip`; restart keeps `genesisHash` |
| `VITE_REQUIRE_PUBLIC_TIP=1`      | Production builds **refuse lab light** as the public picture until `VITE_PIXEL_RPC` is set              |
| `.env.example`                   | Documents both vars                                                                                     |

Ops still required for the claim: host the tip (Railway/VPS), set `VITE_PIXEL_RPC` on the site build.

---

## Checklist (done when…)

- [x] Tip feed contract + restart same Earth — `bun run test:tip-host` (lab)
- [x] Production refuse-lab-light gate — `VITE_REQUIRE_PUBLIC_TIP=1`
- [x] Tip process always on; volume persists across restarts (ops) — Railway `pixel-tip` @ `https://pixel-tip-production.up.railway.app`, volume `/data/pixel`
- [x] `curl …/health` returns stable `genesisHash` after restart on the **public** host — genesis `51a9df90…428a48`
- [ ] Site built with `VITE_PIXEL_RPC` (+ require flag) → `/` shows **public tip**
- [ ] `/wallet` balance + pay leave a tip mark on that canvas

**Lovable / site build (ops left):**

```bash
VITE_PIXEL_RPC=https://pixel-tip-production.up.railway.app
VITE_REQUIRE_PUBLIC_TIP=1
```

PATH: claim “default public tip for humanity” only when the public host checklist is green. Until then: recipe + lab contract evidence + honest labels.

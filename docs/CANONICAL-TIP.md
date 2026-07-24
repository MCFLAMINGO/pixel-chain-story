# Canonical tip feed — operator recipe

**Stance:** invent destination, not today’s claim. The people product is one shared tip everyone can see. Lab notebooks prove light; production `/` must show **that** tip.

Related: [`WORLD-CANVAS.md`](./WORLD-CANVAS.md) · tip marks (`src/lib/pixel/tip-mark.ts`) · people wallet (`/wallet`).

---

## What “canonical” means

| Layer               | Meaning                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| **Canvas**          | `(networkId, genesisHash)` — join the same picture, not a new Earth    |
| **Tip feed**        | HTTP RPC (`/health`, `/sync`, `/pixels`, `POST /tx`) Billboard reads   |
| **People path**     | `/wallet` balance + pay → `shared_tip` receipt when RPC is that tip    |
| **Not yet claimed** | Always-on multi-operator public mainnet; “the” humanity tip by default |

Without `VITE_PIXEL_RPC` / `?rpc=`, the site forges **lab light** (throwaway browser genesis). That is look-dev, not the public picture.

---

## Lab: one laptop tip (evidence path)

```bash
# terminal A — durable tip
bun run pixel -- init --datadir ./data/canonical
bun run pixel -- node --datadir ./data/canonical --rpc 8545 --gossip 9001

# terminal B — site pointed at that tip
VITE_PIXEL_RPC=http://127.0.0.1:8545 bun run dev
# open http://localhost:8080/          → public tip feed + canvas id
# open http://localhost:8080/wallet?rpc=http://127.0.0.1:8545
```

Fund a people pay face (operator faucet — not a product claim):

```bash
bun run pixel -- wallet from-node faucet --datadir ./data/canonical
bun run pixel -- send --from faucet --to <pay-face-pix…> --amount 50 --datadir ./data/canonical
```

Then **Unlock** → **Pay on shared tip** on `/wallet`. Receipt attachment must be `shared_tip`.

Evidence in CI: `bun run test:shared-tip` (in-process node + `POST /tx` + tip inclusion).

---

## Production build

Set at **build time** for Lovable / static host:

```bash
VITE_PIXEL_RPC=https://tip.example.org bun run build
```

`defaultPixelRpc()` (`src/lib/pixel-rpc.ts`) wires `/` and `/wallet`. Query `?rpc=` still overrides for builders.

**Honesty:** do not set `VITE_PIXEL_RPC` until the URL is a real, durable tip you operate (or join). A dead URL is worse than lab light — Billboard will sit on “connecting…”.

---

## Hosting the tip (operators)

Any host that keeps `pixel node` alive with a stable public HTTPS URL works (VPS, container, Railway, etc.). Requirements:

1. Persistent `datadir` (volume) — losing genesis = new Earth
2. Open RPC (`/health`, `/sync`, `/pixels`, `POST /tx`) with CORS (node already allows `*`)
3. Optional gossip for multi-operator join ([`docs/demos/two-node.md`](./demos/two-node.md))
4. Publish the URL as `VITE_PIXEL_RPC` for the site build

Pixel does **not** yet ship a single blessed public hostname. Until one exists, each deploy that sets `VITE_PIXEL_RPC` chooses its canvas — join means matching `genesisHash`.

---

## Tip-mark planes (do not confuse)

| Plane          | Where it settles                                  | May claim “public tip”? |
| -------------- | ------------------------------------------------- | ----------------------- |
| `lab_local`    | Browser / Continuity private genesis              | No                      |
| `node_sidecar` | Continuity session beside node (not `node.chain`) | No                      |
| `shared_tip`   | Tip from `/sync` after `POST /tx` + inclusion     | Yes (that feed only)    |

---

## PATH

Claim “default public tip for humanity” only when a durable hosted feed is the production default and PATH evidence is green. Until then: recipe + `test:shared-tip` + honest labels.

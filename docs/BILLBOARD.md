# The site is the billboard

The public face of Pixel is **the live field** — not a marketing homepage.

```
/           → cinema zoom from genesis (record this from day one)
/lab        → Kindling, Worldlight, builders
/?rpc=URL   → feed a canonical node (what Times Square points at later)
```

## Strategy

1. **Mint genesis** on a node you keep alive (`pixel init` + `pixel node`).  
2. **Point the site** at that node: `VITE_PIXEL_RPC=https://your-node` or `/?rpc=…`.  
3. **Record from frame one** — genesis fills the screen; every new light pulls the camera back.  
4. **When traction exists**, rent Times Square (or any screen) and aim it at the **same URL**. No second product.

## Local

```bash
bun run pixel -- init --datadir ./data/a
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001
bun run dev
# http://localhost:5173/?rpc=http://127.0.0.1:8545
```

Without `rpc`, the browser paints its own local genesis (fine for look-dev; use a durable node for the “official” recording).

## Deploy

Set `VITE_PIXEL_RPC` to your public node’s HTTP origin so visitors see the **same** mosaic you’ll eventually put on the square.

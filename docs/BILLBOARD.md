# Billboard — watch the picture fill in

Yes. The ledger is meant to be seen as light, not only as JSON.

## Times Square (or any screen)

1. Run a public Pixel node that people illuminate against.  
2. Point the billboard player at a fullscreen browser URL:

```
https://your-host/billboard?rpc=https://your-node.example
```

Local demo:

```bash
bun run pixel -- init --datadir ./data/a
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001
bun run dev
# open http://localhost:5173/billboard?rpc=http://127.0.0.1:8545
```

Without `?rpc=`, `/billboard` shows the local browser genesis field (good for a dry-run of the look).

## What the crowd sees

- **Cinema zoom** — genesis is one large lit square; as pixels `#1`, `#2`, … arrive the grid densifies (zoom out)  
- Void until light; each new illumination adds a cell  
- Tip index + lit count  
- Brand: **PIXEL**

Privacy: the board shows the **public skeleton** (that light happened). Veiled amounts stay veiled — same as the privacy model elsewhere.

## Mint genesis (paint pixel #0)

```bash
bun install
bun run pixel -- init --datadir ./data/a
```

That **is** minting genesis: first illumination, **50 PIX** to your sequencer key, pixel `#0` on the canvas.

```bash
bun run pixel -- wallet from-node sequencer --datadir ./data/a   # hold those 50 PIX
bun run pixel -- node --datadir ./data/a --rpc 8545 --gossip 9001
bun run dev
# Billboard zoomed on genesis:
#   http://localhost:5173/billboard?rpc=http://127.0.0.1:8545
```

Next sends illuminate `#1`, `#2`, … — the board pulls back as the field grows.

## Ops notes

- Prefer a dedicated feed URL with CORS open to the billboard origin.  
- 16:9 / full-bleed; no UI chrome.  
- Refresh is ~2s polling of `GET /pixels` + `/health`.

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

- Void until light  
- Each illuminated pixel colors in  
- Tip index + lit count  
- Brand: **PIXEL**

Privacy: the board shows the **public skeleton** (that light happened). Veiled amounts stay veiled — same as the privacy model elsewhere.

## Ops notes

- Prefer a dedicated feed URL with CORS open to the billboard origin.  
- 16:9 / full-bleed; no UI chrome.  
- Refresh is ~2s polling of `GET /pixels` + `/health`.

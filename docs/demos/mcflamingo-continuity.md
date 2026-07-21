# Demo — McFlamingo continuity (honest)

## What is real

| Thing | Where |
| --- | --- |
| Restaurant homepage | https://www.mcflamingo.com/ |
| **Food menu** | https://www.mcflamingo.com/menu |
| Online ordering | https://www.mcflamingo.com/popmenu-order |

Those URLs are the live Popmenu restaurant. If they work in your normal browser, the menu is real.

## What Continuity is (lab — not make-believe hosting)

`/shine` and `/continuity` run in **your browser** (`localStorage`). They:

1. Record that McFlamingo’s origin is `www.mcflamingo.com`
2. Store a **digest** (hash) of homepage HTML for the Continuity map
3. Keep map-fee / till bookkeeping for drills

They do **not**:

- Embed Popmenu inside localhost
- Replace DNS / Cloudflare / Popmenu hosting
- Serve a working restaurant menu from `/mcflamingo/homepage-snapshot.html` (that file is digest-only; opening it looks broken)

## How to try it

```bash
# Fresh ZIP of main — old folders will 404
bun install && bun run dev
```

1. Open http://localhost:8080/shine  
2. Click **Try with real McFlamingo**  
3. Click **Open live McFlamingo menu** → must land on **www.mcflamingo.com/menu**  
4. Or **Order on Popmenu** → **www.mcflamingo.com/popmenu-order**

If step 3 shows Pixel’s “Page not found”, your folder is outdated — download a new ZIP of `main`.

## CLI (lab kill-origin drill)

```bash
bun run test:mcflamingo
```

Proves digest + mirror booth bookkeeping with a local snapshot stand-in. Still not public DNS failover.

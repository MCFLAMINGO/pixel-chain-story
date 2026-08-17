# Pixel ceremony pack

Offline / USB / mirror-friendly bundle for the crowned Earth.

Rebuild hashes anytime: `bun run ceremony:pack`

| Field | Value |
| --- | --- |
| Network id | `20553` |
| Genesis (confirm out loud) | `f1d193f62d54e982…` |
| Default tip (cattle) | `https://pixel-tip-production.up.railway.app` |

## Files in this folder

| File | Role |
| --- | --- |
| `tip-mirrors.json` | HTTP `/sync` mirrors (try in order) |
| `anchors.json` | Public anchor contract addresses |
| `manifest.json` | sha256 of the load-bearing artifacts |

Large fixtures stay next to this pack (do not duplicate in git):

- `../crowned-47.json` — crowned history for offline verify
- `../vectors/protocol-v1.json` — frozen protocol vectors

## Verify offline (no network)

```bash
bun run verify:crowned -- --fixture fixtures/crowned-47.json
```

## Join online (tries mirrors in order)

```bash
bun run pixel -- join --mirrors fixtures/ceremony-pack/tip-mirrors.json \
  --datadir ./pixel-data --require-crowned
```

Read genesis prefix back over a second channel: `f1d193f62d54e982`

## Honesty

- This pack does **not** remove the need for someone serving `/sync` (see `docs/DURABILITY.md`).
- Sequencing remains invitation-only until the hybrid PIX-bond door ships.
- Phones: open `/wallet` — do not run `pixel init`.

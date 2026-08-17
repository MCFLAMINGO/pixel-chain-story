# Hosting independence — GitHub and Railway are cattle

Pixel’s rules live in verifying nodes, not in a cloud account. This runbook is how to
treat tip hosts and source mirrors as **replaceable**. Grades: [`DURABILITY.md`](./DURABILITY.md).

If this file and the tip disagree, the tip’s verifying fold wins.

---

## 1. Source and binary mirrors (D4.1)

| Channel | Role | Notes |
| --- | --- | --- |
| GitHub `MCFLAMINGO/pixel-chain-story` | Collaboration default | Convenience — not existence |
| `fixtures/ceremony-pack/` | USB / torrent / friend-disk pack | Mirrors list + hashes; no GitHub required to *verify* offline |
| `bun run people:verify` | Offline check | Uses `fixtures/crowned-47.json` |
| GitHub Releases (when tagged) | Binaries / source tarballs | Prefer signed tags; still not consensus |

**Non-GitHub path today:** copy `fixtures/ceremony-pack/` + `fixtures/crowned-47.json` +
`fixtures/vectors/protocol-v1.json` onto USB or object storage you control. A stranger with
that pack and Bun (or a second client — see [`VECTORS.md`](./VECTORS.md)) can verify without
opening github.com.

Aspiration — additional public mirrors (Codeberg / self-hosted git) should be listed here
when they exist. Until then: ceremony pack + your own clone.

---

## 2. Tip host migration (D4.2) — minutes, not a ceremony

**Goal:** primary Railway (or any VPS) dies; a new host serves the same crowned history.

### Prep (do this while the tip is healthy)

```bash
# On the live tip host
bun run pixel -- backup --datadir "$PIXEL_DATADIR" --out tip-backup.json
# Keyless by default — safe to give a friend. Keep a second copy offline.
sha256sum tip-backup.json   # record; see content-addressed note below

# Confirm
bun run people:verify -- --live   # or verify:crowned against the tip
```

Store `tip-backup.json` in ≥2 places that are **not** the tip’s volume.

### Cut over

```bash
# New VPS / new Railway service / laptop — empty datadir
bun run pixel -- restore --in tip-backup.json --datadir ./data/tip
# Forges a NEW node identity (backup did not carry the old key unless --include-key)

PIXEL_DATADIR=./data/tip PIXEL_ADVERTISE_HOST=<public-host> bun run tip:host
# or: bun run pixel -- node --datadir ./data/tip --rpc 8545 --gossip 9001 \
#        --advertise <public-host>
```

Checklist (measure in minutes):

1. `curl -s https://NEW/health` → `ok`, same `genesisHash` prefix `f1d193f62d54e982`, same tip height as backup.
2. `/health.advertiseIsLocalhost` is `false`.
3. Edit repo `tip-mirrors.json`: put NEW first (or keep old as dead entry behind it).
4. `bun run ceremony:pack`
5. Site rebuild (if needed): `VITE_PIXEL_RPC=https://NEW` — or rely on mirror fallback once listed.
6. Friend test: `bun run pixel -- join --mirrors tip-mirrors.json --require-crowned`

Proven in CI on a lab network: `bun run test:tip-failover`.

**Producer key:** a keyless restore can **serve and verify** history; it cannot extend the tip
until an electable sequencer is online (invitation today; hybrid bond later). Plan succession
separately ([`OPERATOR.md`](./OPERATOR.md) Tier 3).

---

## 3. People flows without one magic URL (D4.3)

| Surface | How tip is chosen |
| --- | --- |
| CLI join | `--public-tip` / `--mirrors FILE` tries `tip-mirrors.json` in order |
| Site `/wallet`, `/` | `VITE_PIXEL_RPC` if set; else default tip; candidates from builtin mirrors for probe fallback |
| Phones | Still `/wallet` — never `pixel init` |

Operators: prefer listing every public `/sync` in `tip-mirrors.json` over telling friends a
single Railway hostname in chat.

---

## 4. Split tip liveness from anchor publishing (D4.4)

| Concern | Who / what | Failure mode if combined |
| --- | --- | --- |
| Tip HTTP `/sync` | Tip host bill + volume | History unavailable to joiners |
| Anchor `eth_send` | Separate key + RPC credits on Sepolia (etc.) | Tip still serves; strangers lose public-chain confirmation |

**Do:** keep the anchorer key **off** the tip volume when practical; run
`bun run anchor:…` from a different machine or cron account than `tip:host`.
**Do not:** treat “anchors are publishing” as proof the tip volume is backed up.

Verification of anchors needs **no** keys (`eth_call`) — see [`ANCHORING.md`](./ANCHORING.md).

---

## 5. Content-addressed backups (D4.5)

`createBackup` already embeds `manifest.chainDigest`. Treat that digest as the name of the
copy when publishing to object storage:

```text
pixel-backup-<chainDigest-prefix>.json
```

Friends can fetch by hash from any host; hostname is cattle. CLI:

```bash
bun run pixel -- backup --datadir DIR --out tip-backup.json
# print digest from the manifest after write (also in describeBackup)
```

---

## Honest limits

- One listed live mirror in `tip-mirrors.json` is still a practical SPOF until a second
  human runs one ([`DURABILITY.md`](./DURABILITY.md) yellow row).
- This runbook does not replace invitation-only sequencing.
- GitHub disappearing mid-clone is inconvenient; an existing datadir + ceremony pack is enough
  to keep verifying.

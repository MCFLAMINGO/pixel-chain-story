#!/usr/bin/env bash
# Pixel — join ONLY the crowned tip (20553 / f1d193…) as a verifying mirror.
# Never init. Never tip:host. Never PIXEL_GENESIS_CEREMONY.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIN="$ROOT/CROWNED.json"
WANT_PREFIX="f1d193f62d54e982"
WANT_NET=20553
REPO_URL="https://github.com/MCFLAMINGO/pixel-chain-story.git"
WORK="${PIXEL_MIRROR_WORK:-$HOME/pixel-crowned-mirror}"
DATADIR="${PIXEL_DATADIR:-$WORK/data/crowned-mirror}"
RPC_PORT="${PORT:-${PIXEL_RPC_PORT:-8545}}"
GOSSIP_PORT="${PIXEL_GOSSIP_PORT:-9001}"

echo "═══ PIXEL crowned mirror (one Earth only) ═══"
echo "Genesis pin: ${WANT_PREFIX}… · network ${WANT_NET}"
echo

if [[ -f "$PIN" ]]; then
  WANT_PREFIX="$(sed -n 's/.*"genesisPrefix"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PIN" | head -1)"
  WANT_NET="$(sed -n 's/.*"networkId"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' "$PIN" | head -1)"
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun is required. Install from https://bun.sh then re-run this script."
  echo "  curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to clone the Pixel repo."
  exit 1
fi

mkdir -p "$(dirname "$WORK")"
if [[ ! -d "$WORK/.git" ]]; then
  echo "Cloning Pixel Ledger (main)…"
  git clone --depth 1 --branch main "$REPO_URL" "$WORK"
else
  echo "Updating clone…"
  git -C "$WORK" fetch origin main
  git -C "$WORK" checkout main
  git -C "$WORK" pull --ff-only origin main || true
fi

cd "$WORK"
bun install
mkdir -p "$DATADIR"

echo
echo "Joining crowned tip (--public-tip --require-crowned)…"
# Hard refuse any path that would forge a new Earth.
unset PIXEL_GENESIS_CEREMONY PIXEL_TIP_HOST || true
bun run pixel -- join --public-tip --require-crowned --datadir "$DATADIR"

CHAIN_JSON="$DATADIR/chain.json"
if [[ ! -f "$CHAIN_JSON" ]]; then
  echo "REFUSED — no chain.json after join."
  exit 2
fi

# Pin check: pixels[0].hash + networkId must be the one crowned Earth.
PIN_CHECK="$(
  WANT_PREFIX="$WANT_PREFIX" WANT_NET="$WANT_NET" CHAIN_JSON="$CHAIN_JSON" python3 - <<'PY'
import json, os, sys
c = json.load(open(os.environ["CHAIN_JSON"]))
g = (c.get("pixels") or [{}])[0].get("hash") or ""
net = c.get("networkId")
want_p = os.environ["WANT_PREFIX"]
want_n = int(os.environ["WANT_NET"])
ok = isinstance(g, str) and g.startswith(want_p) and net == want_n
print(f"{g[:16]}|{net}|{int(ok)}")
sys.exit(0 if ok else 3)
PY
)" || {
  echo "REFUSED — wrong Earth after join. Delete $DATADIR and re-run."
  echo "  want genesis ${WANT_PREFIX}… / network ${WANT_NET}"
  exit 3
}
echo "Local fold matches crowned Earth · genesis ${WANT_PREFIX}… · network ${WANT_NET} (${PIN_CHECK})"

ADVERTISE="${PIXEL_ADVERTISE_HOST:-}"
if [[ -z "$ADVERTISE" ]]; then
  echo
  echo "No PIXEL_ADVERTISE_HOST set — starting for local verify."
  echo "For a listed public mirror: put HTTPS in front (Cloudflare Tunnel),"
  echo "then restart with PIXEL_ADVERTISE_HOST=your.public.host"
  echo
fi

echo "Starting verifying node on :$RPC_PORT …"
echo "Confirm genesis out loud: ${WANT_PREFIX}…"
if [[ -n "$ADVERTISE" ]]; then
  exec bun run pixel -- node \
    --datadir "$DATADIR" \
    --rpc "$RPC_PORT" \
    --gossip "$GOSSIP_PORT" \
    --advertise "$ADVERTISE"
else
  exec bun run pixel -- node \
    --datadir "$DATADIR" \
    --rpc "$RPC_PORT" \
    --gossip "$GOSSIP_PORT"
fi

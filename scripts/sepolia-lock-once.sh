#!/usr/bin/env bash
# One-shot Sepolia MockUSDC mint → approve → lock for a pix1 pay face.
# Run on your Mac (never paste the key into chat).
#
#   cd ~/pixel-chain-story
#   read -s PIXEL_EVM_DEPLOY_KEY; export PIXEL_EVM_DEPLOY_KEY; echo
#   ./scripts/sepolia-lock-once.sh pix1ff98c57ba1fe081154a1697ad15e6bddc4d3de 1
#
set -euo pipefail
RECIPIENT="${1:?pix1… pay face}"
USD="${2:-1}"
RPC="${PIXEL_EVM_RPC:-https://ethereum-sepolia-rpc.publicnode.com}"
USDC="${PIXEL_EVM_USDC:-0x21A91215fbFc4fc002B07cc87698A6fC01Aed523}"
LOCK="${PIXEL_EVM_LOCK:-0xb99Fbb5aeB6252423a06acb95c9c61fEF8973211}"
KEY="${PIXEL_EVM_DEPLOY_KEY:?set PIXEL_EVM_DEPLOY_KEY (Sepolia funded key)}"
RAW=$((USD * 1000000))
SALT="0x$(openssl rand -hex 32)"

CAST="${CAST:-$(command -v cast || true)}"
if [[ -z "$CAST" && -x "$HOME/.foundry/bin/cast" ]]; then CAST="$HOME/.foundry/bin/cast"; fi
if [[ -z "$CAST" ]]; then echo "cast not found — install Foundry"; exit 1; fi

FROM=$("$CAST" wallet address --private-key "$KEY")
echo "▸ from $FROM"
echo "▸ mint ${USD} MockUSDC"
"$CAST" send "$USDC" "mint(address,uint256)" "$FROM" "$RAW" \
  --rpc-url "$RPC" --private-key "$KEY"

echo "▸ approve lock"
"$CAST" send "$USDC" "approve(address,uint256)" "$LOCK" "$RAW" \
  --rpc-url "$RPC" --private-key "$KEY"

echo "▸ lock → ${RECIPIENT}"
OUT=$("$CAST" send "$LOCK" "lock(uint256,string,bytes32)" "$RAW" "$RECIPIENT" "$SALT" \
  --rpc-url "$RPC" --private-key "$KEY" 2>&1)
echo "$OUT"
TX=$(echo "$OUT" | rg -o '0x[a-fA-F0-9]{64}' | tail -1 || true)

echo
echo "Lock tx: ${TX:-unknown}"
echo "Explorer: https://sepolia.etherscan.io/tx/${TX:-}"
echo
echo "Next: /wallet → Bridge → paste tx → Shine lock → PIX"

#!/usr/bin/env python3
"""
Pixel Ledger — verify-only second client (Python).

This is not a port of the TypeScript node. It independently checks the crowned
fixture for:

  1. Canvas identity (network id + genesis hash)
  2. Pixel linkage (index, prevHash)
  3. Merkle roots over transaction ids (same preimage recipe as pol.ts)
  4. Emission schedule arithmetic (flat 50 PIX × pixel count, capped)
  5. UTXO fold supply equals minted (no signature verification)

It deliberately does **not** verify ML-DSA / OTS signatures yet — that stays the
TypeScript `verify:crowned` path until a second crypto stack exists. The point of
this client is: protocol ≠ one repo, and readable-forever does not require Bun.

Usage:
  python3 clients/verify_crowned.py
  python3 clients/verify_crowned.py path/to/crowned-47.json
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE = ROOT / "fixtures" / "crowned-47.json"

CROWNED_NETWORK_ID = 20553
CROWNED_GENESIS = (
    "f1d193f62d54e98230da5e4b40fbaebb31c176bef241fcb4a44e8f025c8df04f"
    "163e7525cc9f0e99172368380d1e1f5341c0a4b2099c17b1f4ba3c0b6739b777"
)
GENESIS_LIGHT_REWARD = 50
PIX_HARD_CAP = 10_300_000_000
LIGHT_HORIZON = PIX_HARD_CAP // GENESIS_LIGHT_REWARD
EXPECTED_TIP_HASH = (
    "cae382386d6e00ffc7079173c83e7077c36b6ebe189f492871644f29ecdc8faf"
    "33a101257078b03f7b9cc3d64ae9b0a833986190840766ef900b315170403b95"
)


def sha512_hex(message: str) -> str:
    return hashlib.sha512(message.encode("utf-8")).hexdigest()


def merkle_root(txids: list[str]) -> str:
    if not txids:
        return sha512_hex("empty-merkle")
    layer = list(txids)
    while len(layer) > 1:
        nxt: list[str] = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i + 1] if i + 1 < len(layer) else left
            nxt.append(sha512_hex(f"{left}|{right}"))
        layer = nxt
    return layer[0]


def minted_through(pixel_count: int) -> int:
    if pixel_count <= 0:
        return 0
    return min(pixel_count, LIGHT_HORIZON) * GENESIS_LIGHT_REWARD


def fold_utxos(pixels: list[dict]) -> dict[str, dict]:
    utxos: dict[str, dict] = {}
    for pixel in pixels:
        for tx in pixel["transactions"]:
            for inp in tx.get("inputs") or []:
                key = f"{inp['txid']}:{inp['vout']}"
                if key not in utxos:
                    raise SystemExit(f"missing input {key}")
                del utxos[key]
            for vout, out in enumerate(tx["outputs"]):
                utxos[f"{tx['txid']}:{vout}"] = {
                    "amount": out["amount"],
                    "address": out["address"],
                }
    return utxos


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_FIXTURE
    data = json.loads(path.read_text())
    pixels = data["pixels"]
    network_id = data.get("networkId")
    failures = 0

    def check(cond: bool, msg: str) -> None:
        nonlocal failures
        if cond:
            print(f"  ✓ {msg}")
        else:
            print(f"  ✗ {msg}", file=sys.stderr)
            failures += 1

    print("Pixel — Python verify-only client")
    print(f"fixture: {path}")
    print()

    check(network_id == CROWNED_NETWORK_ID, f"networkId is {CROWNED_NETWORK_ID}")
    genesis = pixels[0]["hash"]
    check(genesis == CROWNED_GENESIS, "genesis is the crowned ceremony hash")
    check(len(pixels) == 47, "fixture has 47 pixels")
    check(pixels[-1]["index"] == 46, "tip index is 46")
    check(pixels[-1]["hash"] == EXPECTED_TIP_HASH, "tip hash matches frozen expectation")

    for i, pixel in enumerate(pixels):
        check(pixel["index"] == i, f"pixel[{i}].index == {i}")
        if i == 0:
            check(pixel["prevHash"] == "0" * 128, "genesis prevHash is zero")
        else:
            check(pixel["prevHash"] == pixels[i - 1]["hash"], f"pixel[{i}] links to parent")
        txids = [tx["txid"] for tx in pixel["transactions"]]
        root = merkle_root(txids)
        check(root == pixel["merkleRoot"], f"pixel[{i}] merkleRoot recomputes")

    minted = minted_through(len(pixels))
    check(minted == 2350, f"emission schedule says {minted} PIX minted")
    utxos = fold_utxos(pixels)
    supply = sum(u["amount"] for u in utxos.values())
    check(supply == minted, f"UTXO fold supply {supply} equals minted {minted}")

    print()
    if failures:
        print(f"FAILED — {failures} check(s)", file=sys.stderr)
        print("Signatures were not checked; use bun run verify:crowned for full PQ replay.")
        return 1
    print("VERIFIED (identity + linkage + merkle + emission + supply)")
    print("Signatures not checked in this client — see docs/VECTORS.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

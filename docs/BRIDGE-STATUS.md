# Bridge status (Gate E)

**Claim unlock (lab):** Universal Light Attestation verify is real on the EVM twin — `ULAVerifier.IS_STUB == false`. CosmWasm twin verifies the same frozen fixture. Relayer path proven on local anvil. **Phone wallet** can Bridge USDC/ETH/wire → tip when `PIXEL_BRIDGE_LAB=1`.

**Custody law:** foreign chain holds receipts only; Pixel holds the vault; foreign verify alone never releases master PIX. Enforced in `illuminateIngress` + `bun run test:bridge-custody`.

**Forbidden claim:** production mainnet USDC movement / “Visa on Pixel.”

---

## Friend tip path (live)

```
Phone /wallet → Fund tip (POST /faucet)
             → Bridge USDC (POST /bridge/shine-in)
             → PIX on pay face on crowned tip
```

| Check | Expect |
| --- | --- |
| Tip | `https://pixel-tip-production.up.railway.app` |
| Genesis | starts with `f1d193f62d54e982` |
| Env | `PIXEL_BRIDGE_LAB=1` · `PIXEL_FAUCET=1` |
| Evidence | `bun run test:wallet-bridge` · `curl …/health` shows `bridgeLab` + `faucet` |

---

## Evidence (protocol)

| Artifact | Status |
| --- | --- |
| Frozen fixture | [`fixtures/ula-evm-v1.json`](../fixtures/ula-evm-v1.json) |
| Foundry | `forge test` |
| TS parity | `bun run test:ula` |
| ML-DSA ULA | `bun run test:ula-mldsa` |
| Relayer (local anvil) | `bun run test:ula-relayer` — `Locked` → feed → shineIn |
| Custody inversion | `bun run test:bridge-custody` |
| Phone bridge | `bun run test:wallet-bridge` |

### Public testnet tx links

| Network | Lock / verify tx | Notes |
| --- | --- | --- |
| Ethereum Sepolia (or equiv.) | *pending* | Anvil + tip lab faucet/bridge shipped; paste explorer URLs here when a public lock+verify pair exists |

Until Sepolia links land: **do not claim “testnet bridge live.”** Do claim: tip lab shine-in + faucet for friend invites on the crowned Earth.

---

## Relayer flow (destination)

```
PixelUsdcLock.lock  →  event Locked
        ↓
LockFeeder.fromLockedEvent + ethereumLogVerified
        ↓
LockFeeder.feed → illuminateIngress → PIX on pix1…
```

Shine-out (Pixel → foreign): `createEvmUlaPackage` → foreign `ULAVerifier.accept`.

---

## Commands

```bash
bun run test:ula
bun run test:ula-relayer
bun run test:wallet-bridge
bun run test:bridge-custody
forge test
```

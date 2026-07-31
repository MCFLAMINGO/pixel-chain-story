# Bridge status (Gate E)

**Claim unlock (lab):** Universal Light Attestation verify is real on the EVM twin — `ULAVerifier.IS_STUB == false`. CosmWasm twin verifies the same frozen fixture. Relayer path proven on local anvil. **Phone wallet** can Bridge USDC/ETH/wire → tip when `PIXEL_BRIDGE_LAB=1`.

**Custody law:** foreign chain holds receipts only; Pixel holds the vault; foreign verify alone never releases master PIX. Enforced in `illuminateIngress` + `bun run test:bridge-custody`.

**Forbidden claim:** production mainnet USDC movement / “Visa on Pixel.”

---

## Sepolia lock path (in progress)

```
MetaMask / cast → PixelUsdcLock.lock (Sepolia MockUSDC)
        ↓
Phone /wallet → paste tx  (or Lock USDC MetaMask)
        ↓
Tip POST /bridge/shine-in-lock
        ↓
verify Locked log → illuminateIngress → PIX on pay face
```

| Piece | Status |
| --- | --- |
| Tip verify + consume digests | **shipped** (`shineInFromUsdcLockTx`, `bridge-feeder.json`) |
| Phone Bridge UI (MetaMask + paste tx) | **shipped** when tip publishes `bridgeSepolia` in `/health` |
| Lab open shine-in | Still behind `PIXEL_BRIDGE_LAB=1` (demo only; response marks `lab: true`) |
| Anvil evidence | `bun run test:sepolia-bridge` |
| Public Sepolia deploy + explorer links | **ops — needs funded `SEPOLIA_PRIVATE_KEY`** |

### Deploy (ops)

```bash
export SEPOLIA_PRIVATE_KEY=0x…          # funded Sepolia ETH
export SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
bun run deploy:sepolia-lock
```

Then set on Railway **pixel-tip**:

```bash
PIXEL_BRIDGE_SEPOLIA=1
PIXEL_ETH_RPC=https://ethereum-sepolia-rpc.publicnode.com
PIXEL_ETH_CHAIN_ID=11155111
PIXEL_USDC_LOCK_SEPOLIA=0x…   # from deploy script
PIXEL_USDC_TOKEN_SEPOLIA=0x…  # MockUSDC
PIXEL_ETH_EXPLORER_TX=https://sepolia.etherscan.io/tx/
# optional demo rail:
PIXEL_BRIDGE_LAB=1
PIXEL_FAUCET=1
```

Redeploy tip → `/health` shows `bridgeSepolia` → first lock → paste URLs below.

### Public testnet tx links

| Network | Lock contract | Lock tx | Shine-in tip index | Notes |
| --- | --- | --- | --- | --- |
| Ethereum Sepolia | *pending deploy* | *pending* | *pending* | Fill after `deploy:sepolia-lock` + first phone shine |

Until those rows fill: **do not claim “testnet bridge live.”** Do claim: tip can verify `Locked` and credit PIX when configured; path proven on anvil (`test:sepolia-bridge`).

---

## Friend tip path (lab — still live)

```
Phone /wallet → Fund tip (POST /faucet)
             → Lab Bridge USDC (POST /bridge/shine-in)   # PIXEL_BRIDGE_LAB=1
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
| Tip lock shine-in (anvil) | `bun run test:sepolia-bridge` |
| Custody inversion | `bun run test:bridge-custody` |
| Phone bridge | `bun run test:wallet-bridge` |

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
bun run test:sepolia-bridge
bun run test:wallet-bridge
bun run test:bridge-custody
bun run deploy:sepolia-lock   # needs SEPOLIA_PRIVATE_KEY
forge test
```

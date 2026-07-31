# Bridge status (Gate E)

**Claim unlock (lab):** Universal Light Attestation verify is real on the EVM twin — `ULAVerifier.IS_STUB == false`. CosmWasm twin verifies the same frozen fixture. Relayer path proven on local anvil. **Phone wallet** can Bridge USDC/ETH/wire → tip when `PIXEL_BRIDGE_LAB=1`.

**Custody law:** foreign chain holds receipts only; Pixel holds the vault; foreign verify alone never releases master PIX. Enforced in `illuminateIngress` + `bun run test:bridge-custody`.

**Forbidden claim:** production mainnet USDC movement / “Visa on Pixel.” Pixel is **not** an ETH L2 — foreign chains are ingress venues only.

---

## EVM lock path (agnostic shine-in)

```
MetaMask / cast → PixelUsdcLock.lock (any EVM testnet)
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
| Phone Bridge UI (MetaMask + paste tx) | **shipped** — tip `/health.bridgeEvm` live (Sepolia) |
| Venues (presets) | Sepolia · Base Sepolia · Polygon Amoy · Arbitrum Sepolia |
| Lab open shine-in | Still behind `PIXEL_BRIDGE_LAB=1` (demo; `lab: true`) |
| Anvil evidence | `bun run test:sepolia-bridge` (CI after Foundry) |
| Public lock contracts | **Sepolia live** — first lock tx / tip index still open |

### Live tip env (Railway `pixel-tip`)

```bash
PIXEL_BRIDGE_EVM=1
PIXEL_EVM_CHAIN=sepolia
PIXEL_EVM_RPC=https://ethereum-sepolia-rpc.publicnode.com
PIXEL_EVM_CHAIN_ID=11155111
PIXEL_EVM_LOCK=0xb99Fbb5aeB6252423a06acb95c9c61fEF8973211
PIXEL_EVM_USDC=0x21A91215fbFc4fc002B07cc87698A6fC01Aed523
PIXEL_EVM_EXPLORER_TX=https://sepolia.etherscan.io/tx/
# optional demo rail:
PIXEL_BRIDGE_LAB=1
PIXEL_FAUCET=1
```

Never put deploy private keys on Railway. Tip only needs RPC + public lock/USDC addresses. Confirmed: `curl …/health` → `bridgeEvm.lock` matches above.

### Deploy another venue (ops)

```bash
export PIXEL_EVM_CHAIN=base-sepolia   # or sepolia | amoy | arb-sepolia
export PIXEL_EVM_DEPLOY_KEY=0x…       # funded testnet gas — local only
bun run deploy:evm-lock
```

Legacy `PIXEL_USDC_LOCK_SEPOLIA` / `PIXEL_BRIDGE_SEPOLIA` still read.

### Public testnet tx links

| Network | Lock contract | MockUSDC | Lock tx | Shine-in tip index | Notes |
| --- | --- | --- | --- | --- | --- |
| Ethereum Sepolia | [`0xb99Fbb5a…8973211`](https://sepolia.etherscan.io/address/0xb99Fbb5aeB6252423a06acb95c9c61fEF8973211) | [`0x21A91215…01Aed523`](https://sepolia.etherscan.io/address/0x21A91215fbFc4fc002B07cc87698A6fC01Aed523) | *pending first lock* | *pending* | tip `bridgeEvm` live |
| Base Sepolia | *pending* | *pending* | *pending* | *pending* | easy faucet |
| Polygon Amoy | *pending* | *pending* | *pending* | *pending* | POL gas |
| Arbitrum Sepolia | *pending* | *pending* | *pending* | *pending* | |

**Claim now:** tip verifies `Locked` on Sepolia RPC and can credit PIX. **Still open:** paste first public lock tx + tip pixel index after phone Bridge shine-in. Until then: do not claim “Visa / mainnet USDC.”

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
| Relayer (local anvil) | `bun run test:ula-relayer` |
| Tip EVM lock shine-in (anvil) | `bun run test:sepolia-bridge` |
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
PIXEL_EVM_CHAIN=base-sepolia bun run deploy:evm-lock
forge test
```

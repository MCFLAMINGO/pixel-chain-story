# Bridge status (Gate E)

**Claim unlock (lab):** Universal Light Attestation verify is real on the EVM twin — `ULAVerifier.IS_STUB == false`, now at `MSG_BITS = 256` (the prior 32-bit width was forgeable with a ~2^32 keccak grind; audit PIX-12). CosmWasm twin verifies the same frozen fixture. Relayer path proven on local anvil. **Phone wallet** can Bridge USDC/ETH/wire → tip when `PIXEL_BRIDGE_LAB=1`.

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

| Piece                                         | Status                                                      |
| --------------------------------------------- | ----------------------------------------------------------- |
| Tip verify + consume digests                  | **shipped** (`shineInFromUsdcLockTx`, `bridge-feeder.json`) |
| Phone Bridge UI (Rabby / MetaMask + paste tx) | **live** — tip `/health.bridgeEvm` + first public shine-in  |
| Venues (presets)                              | Sepolia · Base Sepolia · Polygon Amoy · Arbitrum Sepolia    |
| Lab open shine-in                             | Still behind `PIXEL_BRIDGE_LAB=1` (demo; `lab: true`)       |
| Anvil evidence                                | `bun run test:sepolia-bridge` (CI after Foundry)            |
| Public Sepolia lock → tip PIX                 | **proven** — see table below                                |

### Live tip env (Railway `pixel-tip`)

```bash
PIXEL_BRIDGE_EVM=1
PIXEL_EVM_CHAIN=sepolia
PIXEL_EVM_RPC=https://ethereum-sepolia-rpc.publicnode.com
PIXEL_EVM_CHAIN_ID=11155111
PIXEL_EVM_LOCK=0xb99Fbb5aeB6252423a06acb95c9c61fEF8973211
PIXEL_EVM_USDC=0x21A91215fbFc4fc002B07cc87698A6fC01Aed523
PIXEL_EVM_EXPLORER_TX=https://sepolia.etherscan.io/tx/
PIXEL_BRIDGE_LAB=1
PIXEL_FAUCET=1
```

Never put deploy private keys on Railway. Tip only needs RPC + public lock/USDC addresses.

### Deploy another venue (ops)

```bash
export PIXEL_EVM_CHAIN=base-sepolia   # or sepolia | amoy | arb-sepolia
export PIXEL_EVM_DEPLOY_KEY=0x…       # funded testnet gas — local only
bun run deploy:evm-lock
```

Legacy `PIXEL_USDC_LOCK_SEPOLIA` / `PIXEL_BRIDGE_SEPOLIA` still read.

### Public testnet tx links

| Network          | Lock contract                                                                                           | MockUSDC                                                                                                 | Lock tx                                                                                                                   | Shine-in tip index | Notes                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| Ethereum Sepolia | [`0xb99Fbb5a…8973211`](https://sepolia.etherscan.io/address/0xb99Fbb5aeB6252423a06acb95c9c61fEF8973211) | [`0x21A91215…01Aed523`](https://sepolia.etherscan.io/address/0x21A91215fbFc4fc002B07cc87698A6fC01Aed523) | [`0xa1c12522…fea8df`](https://sepolia.etherscan.io/tx/0xa1c12522d6cd051ec09cff0ff7e22e17a24ff453b1aa7e5bb9ed3980abfea8df) | **#7**             | pay face `pix1ff98c57…d3de` · +1 PIX (35→36) · digest consumed (no double credit) |
| Base Sepolia     | _pending_                                                                                               | _pending_                                                                                                | _pending_                                                                                                                 | _pending_          | easy faucet                                                                       |
| Polygon Amoy     | _pending_                                                                                               | _pending_                                                                                                | _pending_                                                                                                                 | _pending_          | POL gas                                                                           |
| Arbitrum Sepolia | _pending_                                                                                               | _pending_                                                                                                | _pending_                                                                                                                 | _pending_          |                                                                                   |

**Claim now:** Sepolia MockUSDC lock → tip verify `Locked` → native PIX on crowned tip (public links above). **Still forbidden:** mainnet USDC / “Visa on Pixel.”

---

## Friend tip path (lab — still live)

```
Phone /wallet → Fund tip (POST /faucet)
             → Lab Bridge USDC (POST /bridge/shine-in)   # PIXEL_BRIDGE_LAB=1
             → PIX on pay face on crowned tip
```

| Check    | Expect                                                                      |
| -------- | --------------------------------------------------------------------------- |
| Tip      | `https://pixel-tip-production.up.railway.app`                               |
| Genesis  | starts with `f1d193f62d54e982`                                              |
| Env      | `PIXEL_BRIDGE_LAB=1` · `PIXEL_FAUCET=1`                                     |
| Evidence | `bun run test:wallet-bridge` · `curl …/health` shows `bridgeLab` + `faucet` |

---

## Anchoring — interop without custody

Pixel publishes its tip to external append-only venues so history cannot be
rewritten behind an anchor. No value moves, so there is nothing to steal, and no
venue is privileged: the digest is portable across EVM chains, Bitcoin
`OP_RETURN`, IPFS or signed tags. See [`ANCHORING.md`](./ANCHORING.md).

Anchoring proves publication time and immutability-after-the-fact. It does **not**
prove the anchored root is correct — that needs an independent archive to compare
against, and ideally agreement across venues.

## What on-chain acceptance actually proves

`ULAVerifier.accept` verifies a **relayer-projected keccak-OTS signature**, not
Pixel's native PIX-ML-DSA-65 proof. A relayer re-projects the native attestation
onto the EVM twin and signs it with an EVM-side key, so acceptance trusts that
relayer to project honestly. `IS_NATIVE_MLDSA_VERIFY == false` states this
on-chain. No signature width changes it.

Bounds on that trust: allowlists are owner-gated and timelocked, additions are
delayed while revocation is immediate, leaves are consumed once, replay is keyed
on `(sequencerRoot, messageHash)`, and `isMatured` lets a consumer impose its own
withdrawal delay.

**Do not describe this as cryptographic verification of the Pixel ledger.**

## Evidence (protocol)

| Artifact                      | Status                                                    |
| ----------------------------- | --------------------------------------------------------- |
| Frozen fixture                | [`fixtures/ula-evm-v1.json`](../fixtures/ula-evm-v1.json) |
| Foundry                       | `forge test`                                              |
| TS parity                     | `bun run test:ula`                                        |
| ML-DSA ULA                    | `bun run test:ula-mldsa`                                  |
| Relayer (local anvil)         | `bun run test:ula-relayer`                                |
| Tip EVM lock shine-in (anvil) | `bun run test:sepolia-bridge`                             |
| Custody inversion             | `bun run test:bridge-custody`                             |
| Phone bridge                  | `bun run test:wallet-bridge`                              |

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

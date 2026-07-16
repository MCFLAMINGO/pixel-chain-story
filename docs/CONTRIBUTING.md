# How to help build Pixel Ledger

We want **runnable truth**, not renamed old tech. Read [`INVENT.md`](./INVENT.md), [`CUSTODY.md`](./CUSTODY.md), and [`PATH.md`](./PATH.md) before you open a PR.

Respect is gated: ship evidence for the next PATH gate; do not inflate claims past `pix_protocolInfo.gates`.

## 60-second start

```bash
git clone <this-repo>
bun install
bun run test:all
bun run dev          # / = live field · /lab = Kindling / Worldlight
```

Builder map (on / for / into): [`BUILDERS.md`](./BUILDERS.md).

Open a PR against `main`. Keep the branch green: `test:all` + `lint` + `build`.

## Who can help (pick a lane)

### 1. Protocol / TypeScript (core)

Highest leverage. Work [`PATH.md`](./PATH.md) / [`ROADMAP.md`](./ROADMAP.md) gates in order (B → C → F for node work):

| Task | Where |
| --- | --- |
| Flake-free two-terminal `pixel init/node/join` | `src/node/` |
| Headers-first sync + peer scoring | `src/node/`, `src/lib/pixel/chain.ts` |
| Bench harness (tx/s published) | `src/lib/pixel/benchmark.ts`, scripts |
| Energy Truth meters (replace models when real) | `energy-truth.ts` |

**Rule:** invent or extend Kindling / Worldlight / LockFeeder / PoLS — don’t paste a wallet SDK and call it done.

### 2. Crypto

| Task | Notes |
| --- | --- |
| ML-DSA / SLH-DSA behind same `sign/verify` | `src/lib/pixel/crypto.ts` — keep PIX-HASH-OTS working |
| CI vectors for sign/verify | Fixed fixtures in `scripts/` |
| Harden OTS / key lifecycle | One-time sig hygiene |

### 3. Solidity / foreign chains

| Task | Notes |
| --- | --- |
| Foundry tests for `PixelUsdcLock` + `MockUSDC` | `contracts/` |
| Real ULA verifier (not stub) | `ULAVerifier.sol` + frozen fixture from `createAttestation` |
| CosmWasm / Move twin of ULA verify | Same message shape |

### 4. Ingress & rails (money + world)

| Task | Notes |
| --- | --- |
| Relayer: watch `Locked` on a testnet → `LockFeeder.feed` | Bridge ops |
| Bank-wire webhook → `attestBankWire` | Correspondent pilot |
| IPFS/HTTP mirrors for SISO | Continuity when origin dies |

### 5. Access & field pilots (non-coders welcome)

| Task | Notes |
| --- | --- |
| SMS/USSD aggregator → invites only → Kindling | Never let SMS spend |
| Village Light Pillar UX (camera + screen) | Kindling presence |
| Bangla / other locale copy review | `access.ts` COPY tables |
| Try BD/KS personas; file what broke | Issues with repro |

### 6. Product / design (people path)

| Task | Notes |
| --- | --- |
| Three-intent phone UI: Kindle / Receive / Balance | Self-custody optical vault |
| No seed-phrase theater; no gas words | [`ACCESS.md`](./ACCESS.md), [`KINDLING.md`](./KINDLING.md) |

### 7. Ops / sovereignty

| Task | Notes |
| --- | --- |
| Run a diverse sequencer (home/colo, not only AWS) | [`VALUE-SOVEREIGNTY-BRIDGE.md`](./VALUE-SOVEREIGNTY-BRIDGE.md) |
| Provider registry experiments | Diversity caps must be real |

## PR checklist

1. `bun run test:all` passes (add a selftest if you add a surface)  
2. Self-custody law intact — no gateway-held user seeds  
3. SMS/USSD cannot spend (invite only)  
4. No metaphor-only PRs — show a failing→passing test  
5. Prefer small PRs that finish one roadmap item  

## What we will reject

- Custodial “easy wallet” that holds people’s Source  
- Renamed MetaMask / M-Pesa / PoS with light adjectives  
- Claims of AWS-proof or quantum-safe without tests  
- Burn theater, unpaid whitepapers as substitutes for code  

## Talk track for recruiting

> Build a light-settlement ledger: self-custody for everyone, Kindling instead of phishing SMS spends, Worldlight for dollars/sites/apps, and PoLS instead of hyperscale energy waste. Clone, `bun run test:all`, pick a roadmap item. Start by lighting cells — 21M is scarcity, not a $21M buy-in ([`BOOTSTRAP.md`](./BOOTSTRAP.md)).

## Questions

Open a GitHub issue with: lane (1–7), what you want to own, and a 3-line plan. Prefer working code over long design docs.

# Pixel Ledger — Value, Sovereignty, Bridges

## 1. Value structure (why PIX is scarce)

Bitcoin’s 21,000,000 cap works because it is **knowable, finite, and tied to security**.
Pixel Ledger copies the **math**, not Proof-of-Work power plants:

| Parameter       | Bitcoin        | Pixel Ledger                   |
| --------------- | -------------- | ------------------------------ |
| Hard cap        | 21,000,000 BTC | **21,000,000 PIX**             |
| Era length      | 210,000 blocks | **210,000 illuminated pixels** |
| Initial reward  | 50 BTC         | **50 PIX**                     |
| Issuance engine | Proof of Work  | **Proof of Light Sequence**    |

**Why hold PIX**

1. **Scarce settlement asset** — hard cap, transparent emission (`economics.ts`)
2. **Utility** — fees / priority to illuminate transfers
3. **Security budget** — light rewards pay sovereign sequencers
4. **Bridge fuel** — PIX locked/escrowed to shine attestations onto other chains
5. **Energy asymmetry** — security without hyperscaler power bills

Fees go to sequencers. Bridge PIX is locked and releasable — never destroyed.

## 2. Sovereignty (ICP-like: no AWS/Cloudflare kill switch)

The ledger protocol **must not depend** on any single cloud or CDN.

Policy in code (`sovereignty.ts`) — **enforced when a ≥7-provider registry is declared** (`setProviderRegistry` / Gate G):

- ≥ 7 independent node providers in an active sequencer set
- No country > 34% of sequencers
- Cloud-hosted sequencers ≤ 34%; single vendor ≤ 20%
- Majority-cloud quorums rejected by honest peers
- **Multiple light subnets** checkpoint each other *(roadmap — Gate J)*
- Light clients dial **many peers** — there is no required `api.*` hostname *(Gate F/G)*

Marketing websites may sit on Cloudflare. **Pixel Ledger nodes must not need to.**

Home / colo / minority-cloud / mobile providers are first-class. Optical paths are codec + simulated capture today; real capture is Gate H.

See [`PATH.md`](./PATH.md) for when “sovereignty regime” becomes an earned claim.

## 3. Agnostic bridging (“shine on all protocols”)

Pixel is **not** an Ethereum L2 and **not** owned by any hub chain.

It emits **Universal Light Attestations (ULA)**:

1. Build bridge message (amount, dest chain, dest address)
2. Anchor in an illuminated pixel’s light proof
3. Relayer carries JSON attestation
4. Destination verifies hash-OTS light proof + message commitment
5. Destination mints/unlocks — Pixel never runs their VM

| Direction    | Meaning                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| **shineOut** | Lock/escrow PIX → attest → unlock on ETH / BTC / Cosmos / Solana / ICP / … |
| **shineIn**  | Lock on foreign chain → commitment on Pixel → release PIX                |

**Custody inversion (law):** foreign chain = receipt; Pixel = vault.  
`ULAVerifier.accept` / foreign verify never releases master PIX. Release is only `illuminateIngress` after a bound foreign receipt (`BRIDGE_CUSTODY_AXIOM`, `bun run test:bridge-custody`).

Targets are peers for receipts: Ethereum, Bitcoin, Cosmos, Solana, Polkadot, ICP, other. Pixel remains the vault.

**Apps do not need a second Facebook.** Build on AWS (or anywhere); come into the
light via SISO. See `docs/CONTINUITY-SISO.md`.

## Commands

```bash
bun run test:pixel
bun scripts/l1-selftest.ts
bun scripts/scale-thesis-selftest.ts
```

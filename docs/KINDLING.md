# Kindling — people settle in light

Not a wallet. Not SMS money. Not multisig with a new name.

## The door

1. **Forge Personal Source** — optical vault (self-custody)
2. **Offer / Accept** — two optical halves bound to name → name → amount
3. **Confluence** — lights meet → Presence Seal
4. **Unlock & settle** — _your_ Source signs; PoLS illuminates; Energy Truth recorded

Remote scammers cannot stand in your light. Stolen halves expire. Gateways cannot sign for you.

**Pay face ≠ vault:** the illuminated phone face people see while Kindling must be a **public** picture of claim/state — not the maze/vault grid that recovers the seed. The grid is only a representation of code; it need never show. See [`CUSTODY.md`](./CUSTODY.md).

### Phone `/wallet` — pay-face matrix (shipped)

People path (not vault, not tip `settleKindling` yet):

1. **Hold → Show face** — 16×16 luminance grid encodes public `pix1…` (`PXP1` magic + address body)
2. **Send → Scan matrix** — camera samples the grid → To fills; marks optical presence
3. **Send PIX** — still tip RPC pay; receipt notes Kindling when address came from camera

QR / Paste remain fallbacks. Full offer/accept Presence Seal → tip settle is the next invent step (`KindlingPanel` on `/lab` already proves seal locally).

## Law

Self-custody is mandatory (`assertSelfCustody`). `gatewayHeldSeed: true` throws.

**Optical:** pass captures from `optical-capture.ts` (getUserMedia or raster sample) into `confluentSeal` → seal `channel: "optical-capture"`. Headless CI may omit captures and get `channel: "simulated"`. Distinct `partyId`s still required. Lab Kindling uses the raster optical path by default. Confluence light is **presence**, not “whoever photographed the vault owns the Source.”

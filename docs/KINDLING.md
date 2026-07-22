# Kindling — people settle in light

Not a wallet. Not SMS money. Not multisig with a new name.

## The door

1. **Forge Personal Source** — optical vault (self-custody)
2. **Offer / Accept** — two optical halves bound to name → name → amount
3. **Confluence** — lights meet → Presence Seal
4. **Unlock & settle** — _your_ Source signs; PoLS illuminates; Energy Truth recorded

Remote scammers cannot stand in your light. Stolen halves expire. Gateways cannot sign for you.

**Pay face ≠ vault:** the illuminated phone face people see while Kindling must be a **public** picture of claim/state — not the maze/vault grid that recovers the seed. The grid is only a representation of code; it need never show. See [`CUSTODY.md`](./CUSTODY.md).

## Law

Self-custody is mandatory (`assertSelfCustody`). `gatewayHeldSeed: true` throws.

**Optical:** pass captures from `optical-capture.ts` (getUserMedia or raster sample) into `confluentSeal` → seal `channel: "optical-capture"`. Headless CI may omit captures and get `channel: "simulated"`. Distinct `partyId`s still required. Lab Kindling uses the raster optical path by default. Confluence light is **presence**, not “whoever photographed the vault owns the Source.”

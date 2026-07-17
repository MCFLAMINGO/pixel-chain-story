# Kindling — people settle in light

Not a wallet. Not SMS money. Not multisig with a new name.

## The door

1. **Forge Personal Source** — optical vault (self-custody)  
2. **Offer / Accept** — two optical halves bound to name → name → amount  
3. **Confluence** — lights meet → Presence Seal  
4. **Unlock & settle** — *your* Source signs; PoLS illuminates; Energy Truth recorded  

Remote scammers cannot stand in your light. Stolen halves expire. Gateways cannot sign for you.

## Law

Self-custody is mandatory (`assertSelfCustody`). `gatewayHeldSeed: true` throws.

**Optical:** pass captures from `optical-capture.ts` (getUserMedia or raster sample) into `confluentSeal` → seal `channel: "optical-capture"`. Headless CI may omit captures and get `channel: "simulated"`. Distinct `partyId`s still required. Lab Kindling uses the raster optical path by default.

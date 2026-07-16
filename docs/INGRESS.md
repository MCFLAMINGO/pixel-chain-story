# How real things enter Pixel

Not a whitepaper. The doors:

## 1. “I want $5 USD on the ledger”

```
USD/USDC/wire locked elsewhere (bank, ETH, etc.)
        ↓  foreign lock attestation
   Worldlight shineIn
        ↓
   Bridge escrow releases PIX
        ↓
   Your Personal Source address (self-custody)
```

Demo rate: `DEMO_PIX_PER_USD` (labeled model — production uses attested FX/stablecoin locks).  
SMS cannot do this. A custodian app must not hold your seed while “onboarding.”

```ts
const you = await One.Custody.forge("dale");
const prepared = await One.Worldlight.usd(5, {
  address: you.source.address,
  localId: "dale",
}, "wire-ref-abc");
const { state, summary } = await One.Worldlight.illuminate({
  prepared, state, bridgeVault, sequencer,
});
```

## 2. “I want mcflamingo.com on the ledger”

You do **not** rebuild the site for a Pixel VM.

```
https://mcflamingo.com  (keeps running on its host)
        ↓  digest + mirrors
   SISO / Worldlight domain ingress
        ↓
   Continuity record in the light
```

If the host dies and mirrors exist, peers can still serve what was shone in.  
Same path for a Facebook-scale app: **one codebase**, shine in — no second Facebook.

## 3. “I want McFlamingo corporate bank account on the ledger”

The bank account is not “a wallet owned by Stripe.”

```
Treasury ref (IBAN/account digest) + org name
        ↓
   Treasury continuity bound to owners' Personal Sources
        ↓
   Spends still Kindling (officers' lights) — self-custody law
```

## Custody

Ingress never takes user seeds. Bridge vault is escrow for shine-in PIX only.

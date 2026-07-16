# How real things enter Pixel

Not a whitepaper. The doors:

## 1. “I want $5 USD on the ledger”

```
Lock USDC (PixelUsdcLock / LocalUsdcRail)  OR  attest bank wire
        ↓  verified LockReceipt
   One.LockFeeder.feed
        ↓
   Worldlight illuminate (bridge escrow → PIX)
        ↓
   Your Personal Source  +  LockFeeder.consume
```

Rate: `DEMO_PIX_PER_USD` (labeled). See `docs/LOCK-FEEDER.md`.

```ts
const you = await One.Custody.forge("you");
const rail = One.LockFeeder.createRail();
One.LockFeeder.mintUsdc(rail, "0xYou", 5);
const receipt = await One.LockFeeder.lockUsdc({
  rail, locker: "0xYou", humanUsd: 5, pixelRecipient: you.source.address,
});
const feeder = One.LockFeeder.createState();
const prepared = await One.LockFeeder.feed({ receipt, ownerLocalId: "you", feeder, rail });
const { state } = await One.Worldlight.illuminate({ prepared, state, bridgeVault, sequencer });
One.LockFeeder.consume(feeder, receipt.lockDigest);
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
Feeder verifies locks; it does not custody Pixel Sources.

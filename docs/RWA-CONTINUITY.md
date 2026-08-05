# RWA continuity receipts — scope, with the limit written first

**Status: SCOPED, NOT BUILT.** Nothing in this document is shipped. It exists so
the honest claim is fixed before any code makes it tempting to overstate.

## The line that cannot be crossed

> A post-quantum attestation of an ECDSA-secured position does **not** make that
> position quantum-safe.

If Robinhood Chain's keys break, the tokenized asset is gone regardless of how
well Pixel remembered it. Pixel holds a durable, PQ-signed record **that the
position existed** — provenance that survives the venue, not protection of the
asset.

**Sellable:** "your position's history outlives the chain that hosted it."
**Forbidden:** "quantum-safe RWA," "PQ-protected holdings," "your assets are
secured by ML-DSA."

The second list is exactly the overclaim the PATH gates exist to prevent. It goes
in [`PATH.md`](./PATH.md) as a forbidden-claim line before the first line of code.

## What it would actually be

A holder of tokenized equities on an ECDSA chain wants a record of their position
that does not depend on that chain continuing to exist, cooperate, or remain
uncompromised.

1. The holder's position digest is computed from public chain state — balance,
   token, block height, and the chain's own state root.
2. Pixel lights a pixel attesting to it: `PIX-ML-DSA-65` signed, positioned,
   timestamped, and re-witnessed by every pixel lit afterwards.
3. The attestation is verifiable off-chain by anyone with the public key. No
   bridge, no custody, no value crossing.

This is [`SISO`](./CONTINUITY-SISO.md) applied to a position instead of an app:
keep your stack where it is, shine in once.

## Why it fits what already exists

| Piece | Already built |
| --- | --- |
| PQ signatures | `PIX-ML-DSA-65` is the default scheme |
| Authorship | `lit-cell.ts` names whose moment a pixel records |
| Human-readable content | `ReadableMeta` on every transaction |
| Independent verifiability | `anchor.ts` + `anchor-evm.ts`, multi-venue |
| Continuity when origin dies | `siso.ts`, mirrors, the continuity desk |

Nothing new is required at the protocol layer. That is the point — if this needed
a bridge or a second token, it would be the wrong product.

## What must be true for the receipt to mean anything

**Attest only to independently checkable facts.** A position digest derived from
public chain state is checkable by anyone with an RPC. "Erik owns 100 NVDA" on
Pixel's word alone is a diary entry.

So the receipt must carry what it was derived from: chain id, block number, block
hash, contract address, holder address, and the raw balance — enough that a
skeptic can recompute it against an archive node and get the same digest.

**The attestor is not the source of truth.** Pixel says "this is what the chain
said at this height," not "this is true."

## Open questions, unanswered on purpose

1. **Who signs?** A single Pixel-operated attestor is a trusted party. Several
   independent observers attesting the same digest is the same argument as
   multi-venue anchoring, and probably the same answer.
2. **What happens when the position changes?** A receipt is a moment, not a
   balance. A stream of receipts is a history; a single one is a snapshot. Which
   is being sold matters for what it's worth.
3. **Regulatory surface.** Attesting to securities positions is not the same
   activity as attesting to a payment, even when the code is identical. This
   needs an answer from someone qualified before it takes a customer.
4. **Does the holder want it, or does a counterparty?** The buyer might be an
   auditor, a lender taking the position as collateral, or an insurer — not the
   holder. That changes the product.

## Sequencing

Anchoring first, because it's built and it makes Pixel's own history checkable by
strangers — which is the credibility this depends on. A continuity receipt from a
chain nobody can independently verify is worth nothing.

Then one receipt, by hand, for one real position, and see whether a counterparty
accepts it. That answers more than another month of design.

## What this is explicitly not

Not a bridge. No value moves. No custody. No lock, no mint, no burn, no release
path. If a future version needs one, that is the signal the idea was wrong rather
than incomplete — see the forbidden-additions discipline in
[`EMISSION.md`](./EMISSION.md).

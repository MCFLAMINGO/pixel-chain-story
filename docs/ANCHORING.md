# Tip anchoring — interop that cannot lose anyone's money

Pixel publishes its tip to external, timestamped, append-only venues. Anyone
handed a Pixel history can check it against what was published and cannot be
shown a history that was quietly rewritten.

**No custody. No release path. Nothing to drain.** This is the interop that
carries information rather than value — the distinction that keeps Pixel out of
the failure class that has cost bridges roughly $2.8B.

## What it proves

A `(networkId, pixelIndex, tipHash, spatialRoot)` record was published at a
venue-attested time, and was never changed afterwards.

## What it does not prove

That the anchored root is **correct**. An anchorer can publish a root for an
invalid chain. Anchoring is tamper-evidence and timestamping, not validation.

Detection therefore needs two things:

1. **At least one independent archive** of Pixel history to compare against. An
   anchor with no second copy is a hash nobody can contradict.
2. **More than one venue**, so venues can be compared to each other. Two that
   agree is meaningfully stronger; two that disagree is an early alarm.

## No privileged venue

The portable unit is a 32-byte digest:

```
digest = keccak256( networkId(8) ‖ pixelIndex(8) ‖ tipHash(64) ‖ spatialRoot(64) )
```

Both Pixel digests are SHA-512 (64 bytes), length-checked so the packed encoding
is unambiguous. `anchorDigest()` in [`src/lib/pixel/anchor.ts`](../src/lib/pixel/anchor.ts)
and `PixelAnchor.anchorDigest` in [`contracts/PixelAnchor.sol`](../contracts/PixelAnchor.sol)
are byte-identical, pinned by a frozen vector asserted on both sides.

That means the same record can go to an EVM chain, a Bitcoin `OP_RETURN`, IPFS,
or a signed tag without changing what is committed to. This is the same rule the
bridge doctrine already states: **no privileged hub chain.**

Implement `AnchorVenue` to add one:

```ts
export interface AnchorVenue {
  id: string;
  kind: "evm" | "bitcoin" | "ipfs" | "file" | "other";
  publish: (record: PixelAnchorRecord) => Promise<PublishedAnchor>;
  fetch: (networkId: number, pixelIndex: number) => Promise<PublishedAnchor | null>;
}
```

## On-chain guarantees

`PixelAnchor.sol` is deliberately small:

| Property | Mechanism |
| --- | --- |
| Append-only | A height is written once; re-anchoring reverts `AlreadyAnchored` |
| Permissioned writes | `setAnchorer` is owner-only, additions timelocked, revocation immediate |
| Two-step ownership | `transferOwnership` → `acceptOwnership` |
| Self-consistent | The digest is computed on-chain from the submitted values, so storage and event cannot disagree |
| Cheap | ~98k gas for the first anchor at a height |

Append-only matters most: a stolen anchorer key cannot revise the past, only
add to the future — and the future is comparable against every other venue.

## Usage

```ts
import {
  buildAnchorFromState,
  publishToAll,
  compareVenues,
  verifyAnchorAgainstChain,
} from "@/lib/pixel";

const record = buildAnchorFromState(state);
const { published, failures } = await publishToAll(record, venues);

const agreement = compareVenues(published);   // do the venues agree?
const check = verifyAnchorAgainstChain(record, state); // does our history agree?
```

## Evidence

```bash
bun run test:anchor      # portable digest, append-only, rewrite + disagreement detection
forge test --match-contract PixelAnchorTest
```

The selftest deploys `PixelAnchor` on anvil and asserts that Solidity and
TypeScript compute the identical digest, then that the contract accepts the real
tip and rejects a rewritten one.

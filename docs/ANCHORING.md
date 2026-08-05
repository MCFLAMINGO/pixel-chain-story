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

## Venues

Verified 2026-08-05. Every entry is **witness-only**: the venue stores a 32-byte
digest and a timestamp, cannot forge an anchor, and holds nothing to seize.

| Venue | Chain ID | Sequencer | Note |
| --- | --- | --- | --- |
| `robinhood-testnet` | 46630 | centralized | Arbitrum Orbit L2 for tokenized equities |
| `robinhood-mainnet` | 4663 | centralized | operator can reorder or censor; cannot forge |
| `base-sepolia` | 84532 | centralized | OP Stack testnet |
| `base-mainnet` | 8453 | centralized | OP Stack L2 |
| `ethereum-sepolia` | 11155111 | decentralized | slowest, cheapest independence check |

A centralized sequencer is acceptable **for witnessing** — the worst it can do is
refuse or delay a hash everyone can see is missing. It is not acceptable as a
value rail: a chain custodying tokenized securities has a compliance function
that can be compelled to freeze or reorder.

`venueSetWarnings()` enforces this in code rather than in prose. One venue warns.
An all-centralized set warns. Adding an independent chain clears it.

## Publishing and verifying

**Verification needs no keys.** `verifyOnChain` and `readAnchor` use `eth_call`,
so any stranger can check an anchor against any RPC without an account. That is
the half that has to be permissionless.

**Publishing takes an injected sender.** This repo has no secp256k1 dependency,
and adding one to sign transactions would put a fresh crypto library on the
critical path of a project that just finished removing hand-rolled crypto.
`castSender` wires up Foundry, which CI already installs.

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

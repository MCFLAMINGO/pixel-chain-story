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

| Venue               | Chain ID | Sequencer     | Note                                         |
| ------------------- | -------- | ------------- | -------------------------------------------- |
| `robinhood-testnet` | 46630    | centralized   | Arbitrum Orbit L2 for tokenized equities     |
| `robinhood-mainnet` | 4663     | centralized   | operator can reorder or censor; cannot forge |
| `base-sepolia`      | 84532    | centralized   | OP Stack testnet                             |
| `base-mainnet`      | 8453     | centralized   | OP Stack L2                                  |
| `ethereum-sepolia`  | 11155111 | decentralized | slowest, cheapest independence check         |

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

| Property            | Mechanism                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Append-only         | A height is written once; re-anchoring reverts `AlreadyAnchored`                                |
| Permissioned writes | `setAnchorer` is owner-only, additions timelocked, revocation immediate                         |
| Two-step ownership  | `transferOwnership` → `acceptOwnership`                                                         |
| Self-consistent     | The digest is computed on-chain from the submitted values, so storage and event cannot disagree |
| Cheap               | ~98k gas for the first anchor at a height                                                       |

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

const agreement = compareVenues(published); // do the venues agree?
const check = verifyAnchorAgainstChain(record, state); // does our history agree?
```

## Going live

```bash
# 0. one-time: a throwaway key that only ever publishes digests
cast wallet new                       # store as ANCHOR_PRIVATE_KEY

# 1. check everything without spending
bun run anchor:deploy -- --venue robinhood-testnet --dry-run

# 2. fund it — the one step a script cannot do
#    https://faucet.testnet.chain.robinhood.com   (wallet + human verification)
#    or bridge Sepolia ETH via https://portal.arbitrum.io/bridge

# 3. deploy + anchor + verify
bun run anchor:deploy -- --venue robinhood-testnet

# 4. a second, independent venue — one is not evidence
bun run anchor:deploy -- --venue ethereum-sepolia --pixel <n>
```

The tip must expose `pix_getTipAnchor`. There is deliberately **no fallback**:
`pix_getBlockByNumber` truncates the SHA-512 hash to 32 bytes for display and
does not return `spatialRoot`, so a header cannot describe an anchor. A tip on an
older build has to be redeployed first, and the script says so.

The anchorer key holds no value — it publishes 32-byte digests and nothing else.
Compromising it lets an attacker add a wrong digest that every other venue
contradicts; it does not let them rewrite the past, because a height can only be
written once.

## Verifying — the half that matters

Publishing is what the operator does. **Verifying is what a stranger does**, and
it needs no account, no key, and no trust in the operator:

```bash
bun run anchor:verify -- --pixel 12 \
  --anchors robinhood-testnet=0xABC…,ethereum-sepolia=0xDEF…
```

Or, using the addresses committed in `anchors.json`:

```bash
bun run anchor:verify
```

```
✓ robinhood-testnet   matches      anchored 2026-08-05T17:41:43.000Z by 0xf39f…
✓ ethereum-sepolia    matches      anchored 2026-08-05T17:44:02.000Z by 0xf39f…

2/2 venues agree with the tip
```

Every read is `eth_call`. It exits non-zero when a venue diverges, holds nothing,
or cannot be read, so it works as a scheduled divergence alarm rather than a
manual ritual. Add `@rpcUrl` after a contract address to check a private or local
endpoint without editing the registry.

Divergence means one of two things, and both matter: the tip's history was
rewritten, or a venue was handed a false digest. Neither can be quietly repaired,
because heights are write-once.

## Staying anchored

The deployed addresses live in `anchors.json`, so verification needs no
arguments at all:

```bash
bun run anchor:verify
```

### What verify asks

Anchoring is periodic, so **most heights are never anchored** — that is the design,
not a fault. Asking "is the current tip anchored?" is therefore normally answered
"no" on a perfectly healthy venue, and a monitor that failed on it would be red
almost always, which trains you to ignore it.

So with no arguments, verify holds each venue to _its own newest claim_: the
latest height it anchored, checked against local history. It then states how far
the tip has advanced past that, because that is where the guarantee stops.

| Reported      | Meaning                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `matches`     | the venue's newest anchor still agrees with local history                                                 |
| `diverges`    | the venue holds a different digest — alarm, unfixable                                                     |
| `absent`      | the venue holds nothing at all, or nothing at a height you named                                          |
| `stale`       | everything agrees, but the tip has sat ahead of the newest anchor for over `--max-age-hours` (default 48) |
| `unreachable` | the RPC could not be read                                                                                 |

`stale` exists because agreement alone is not health. A publisher that runs out of
gas leaves perfectly matching anchors behind it, and every venue keeps saying
`matches` forever while nothing new is witnessed.

But elapsed time alone is the wrong test, because **a chain with no new moments has
nothing to publish**. An idle chain whose tip is fully anchored is healthy however
long ago that anchor was written, and calling it stale is a false alarm — the same
mistake as reporting agreement as divergence, one layer up.

So the alarm is _unwitnessed history_: the tip has advanced past the newest anchor
and stayed there past the limit. Both conditions, never one.

Stale also counts toward agreement in the summary line, because a stale venue holds
the correct digest and is merely behind. Only a _different_ digest is divergence.

Pass `--pixel N` to ask about one specific height instead.

Anchoring one height proves that height and nothing after it. `.github/workflows/anchor.yml`
runs every six hours, anchors the current tip to every venue in `anchors.json`,
and then runs the keyless verify. Publishing needs the `ANCHOR_PRIVATE_KEY`
repository secret; the verify step runs regardless, because the whole point is
that checking requires no permission.

A height has exactly three outcomes, decided by `anchorAction()`:

| Outcome            | Meaning                          | Run                              |
| ------------------ | -------------------------------- | -------------------------------- |
| `publish`          | height is empty                  | anchors, then verifies keylessly |
| `already-anchored` | venue holds the same digest      | no-op, exits clean               |
| `divergence`       | venue holds a _different_ digest | halts and reports both digests   |

Two consequences follow. A repeated run is a no-op rather than a failure, so the
schedule is safe and the already-anchored check runs before the key and balance
checks — a run with nothing to publish needs no funded key. And divergence stops
the run instead of retrying, because a write-once height cannot be corrected by
publishing again.

## Evidence

```bash
bun run test:anchor      # portable digest, append-only, rewrite + disagreement detection
bun run test:anchor-evm  # venue adapter on anvil, including a real divergence
forge test --match-contract PixelAnchorTest
```

The selftest deploys `PixelAnchor` on anvil and asserts that Solidity and
TypeScript compute the identical digest, then that the contract accepts the real
tip and rejects a rewritten one. `test:anchor-evm` goes further and publishes a
false digest to a live anvil height, confirming the alarm fires there rather than
only in an abstract assertion.

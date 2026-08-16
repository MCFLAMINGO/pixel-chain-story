/**
 * The bounds. Every one of them, in one file, so a reader can audit the whole
 * resource surface without grepping.
 *
 * An L1 that does not bound its inputs is a machine anyone can switch off. Until
 * this file existed there was no block transaction limit, no block size limit, no
 * mempool cap, and no page size on catch-up — so a peer could hand over a block
 * with an arbitrary number of transactions and a node would verify every signature
 * under its chain lock. At the repo's own measured ~4.6 ms per verify, ten thousand
 * transactions is around forty-six seconds of a node that answers nothing.
 *
 * ## How these numbers were chosen
 *
 * Generously, then checked against reality. The busiest pixel on the crowned chain
 * carries two transactions and the largest metadata object is 136 bytes, so real
 * traffic is three orders of magnitude inside every ceiling here.
 * `scripts/crowned-replay-selftest.ts` asserts that, which is the point: a bound
 * that would have rejected real history is not a bound, it is a fork.
 *
 * ## Consensus versus policy
 *
 * **Consensus bounds** (`MAX_BLOCK_*`) are part of block validity. Changing them
 * changes what a valid block is, so they belong in `docs/SPEC.md` and cannot move
 * without a coordinated upgrade.
 *
 * **Policy bounds** (`MAX_PENDING_TX`, the rate limits) are local resource
 * decisions. Two honest nodes may disagree about them and still agree completely
 * about the chain. They are deliberately kept in the same file so that nobody has
 * to guess which kind they are reading — the distinction is stated per constant.
 */

// ── Consensus: what makes a block valid ────────────────────────────────────────

/**
 * CONSENSUS. Transactions per block.
 *
 * Checked before any signature is verified, so an oversized block costs a length
 * comparison rather than thousands of lattice operations. That ordering is the
 * actual defence; the number is just a ceiling.
 */
export const MAX_BLOCK_TXS = 4096;

/**
 * CONSENSUS. Serialized bytes of a block's transaction set.
 *
 * A transaction count alone does not bound work: 4,096 transactions each carrying
 * a maximal metadata object and 64 inputs is still a large object to hash. Bytes
 * bound what the count cannot.
 */
export const MAX_BLOCK_TX_BYTES = 2_097_152; // 2 MiB

/**
 * CONSENSUS. Membership records per block (see `membership.ts`, T1.1).
 *
 * Membership changes are rare by nature and expensive to validate — each carries a
 * proof of possession and an authorization signature. A block has no honest reason
 * to carry many.
 */
export const MAX_BLOCK_MEMBERSHIP_RECORDS = 16;

/**
 * CONSENSUS. Serialized bytes of one transaction's metadata object.
 *
 * Metadata is signed and stored forever, so it is a permanent write to every copy
 * of the chain. The zod schema separately caps each known field; this bounds the
 * object as a whole. Largest on the crowned chain: 136 bytes.
 */
export const MAX_METADATA_BYTES = 4096;

// ── Policy: local resource protection ─────────────────────────────────────────

/**
 * POLICY. Transactions held in the mempool.
 *
 * Rejected on overflow rather than evicted. Eviction would silently drop a *valid*
 * transaction that a wallet has already reported as sent, and a failure that
 * renders as an ordinary state is worse than an error because the user acts on it.
 * A refusal at the door is honest and the sender can retry.
 */
export const MAX_PENDING_TX = 4096;

/**
 * POLICY. Pixels returned in one gossip `pixels` message or `/pixels` response.
 *
 * Catch-up is paged. A joining node asking for history should not be able to make
 * a peer serialize the entire chain into a single frame, and should not be able to
 * make itself the reason that peer stops answering anyone else.
 *
 * A *count* is not enough on its own, which is why `MAX_PIXEL_PAGE_BYTES` exists
 * beside it: real pixels on the crowned chain run around 29 KB each, so 512 of them
 * is roughly 15 MB — well over any sane frame. Whichever bound is reached first ends
 * the page.
 */
export const MAX_PIXELS_PER_MESSAGE = 512;

/**
 * POLICY. Serialized bytes of one page of pixels.
 *
 * The bound that actually binds. Deliberately smaller than
 * `MAX_GOSSIP_FRAME_BYTES` so a full page plus envelope always fits in a frame,
 * with room for the roughly 2x expansion of hex-encoded sealed transport.
 */
export const MAX_PIXEL_PAGE_BYTES = 2_097_152; // 2 MiB

/**
 * POLICY. Raw bytes of one inbound gossip frame, checked before `JSON.parse`.
 *
 * Parsing is where an attacker gets leverage, so the length check comes first.
 *
 * Larger than the HTTP body cap on purpose. A single valid block may be up to
 * `MAX_BLOCK_TX_BYTES`, and a block that consensus accepts but the wire cannot
 * carry would be a chain that cannot replicate itself — so the frame budget has to
 * clear the largest legal block with room for sealed-transport expansion.
 */
export const MAX_GOSSIP_FRAME_BYTES = 8_388_608; // 8 MiB

/**
 * POLICY. Sequencer identities accepted from one `hello`.
 *
 * A hello is display metadata, not authority — after T1.1 the electable set is a
 * fold over chain history and a hello cannot change who may produce. It can still
 * be a bucket of memory if it is unbounded.
 */
export const MAX_HELLO_SEQUENCERS = 256;

// ── Policy: write-path rate limiting ──────────────────────────────────────────

/**
 * POLICY. Token bucket for write endpoints, per client.
 *
 * Reads are deliberately not limited. The entire premise is that a stranger can
 * verify the chain without asking anyone's permission, so throttling `/sync` would
 * cost the property the project exists to have. Writes are what consume storage
 * the operator pays for, so writes are what get a bucket.
 */
export const RATE_LIMIT_BURST = 30;

/** POLICY. Sustained write rate per client, tokens per second. */
export const RATE_LIMIT_REFILL_PER_SEC = 3;

/** POLICY. Distinct client buckets tracked before the table is pruned. */
export const RATE_LIMIT_MAX_CLIENTS = 4096;

/**
 * One page of pixels from `from`, bounded by both count and bytes.
 *
 * Shared by the gossip `get_pixels` reply and `GET /pixels` so the two cannot page
 * differently — a joiner that syncs over one and not the other is the kind of
 * asymmetry that only shows up on a chain long enough to matter.
 *
 * Always returns at least one pixel when one exists, even if that single pixel is
 * over the byte budget. A block big enough to exceed the page budget still has to be
 * deliverable, or history could contain something that cannot be replicated.
 */
export function pixelPage<T>(
  pixels: readonly T[],
  from: number,
  opts: { maxCount?: number; maxBytes?: number } = {},
): { page: T[]; hasMore: boolean; nextFrom: number } {
  const maxCount = opts.maxCount ?? MAX_PIXELS_PER_MESSAGE;
  const maxBytes = opts.maxBytes ?? MAX_PIXEL_PAGE_BYTES;
  const start = Math.max(0, from);
  const page: T[] = [];
  let bytes = 0;
  for (let i = start; i < pixels.length && page.length < maxCount; i++) {
    const size = JSON.stringify(pixels[i]).length;
    if (page.length > 0 && bytes + size > maxBytes) break;
    page.push(pixels[i]!);
    bytes += size;
  }
  const nextFrom = start + page.length;
  return { page, hasMore: nextFrom < pixels.length, nextFrom };
}

/** Everything above, for `/health` and the truth badges. */
export function limitsSnapshot(): {
  consensus: Record<string, number>;
  policy: Record<string, number>;
} {
  return {
    consensus: {
      maxBlockTxs: MAX_BLOCK_TXS,
      maxBlockTxBytes: MAX_BLOCK_TX_BYTES,
      maxBlockMembershipRecords: MAX_BLOCK_MEMBERSHIP_RECORDS,
      maxMetadataBytes: MAX_METADATA_BYTES,
    },
    policy: {
      maxPendingTx: MAX_PENDING_TX,
      maxPixelsPerMessage: MAX_PIXELS_PER_MESSAGE,
      maxPixelPageBytes: MAX_PIXEL_PAGE_BYTES,
      maxGossipFrameBytes: MAX_GOSSIP_FRAME_BYTES,
      maxHelloSequencers: MAX_HELLO_SEQUENCERS,
      rateLimitBurst: RATE_LIMIT_BURST,
      rateLimitRefillPerSec: RATE_LIMIT_REFILL_PER_SEC,
    },
  };
}

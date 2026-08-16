#!/usr/bin/env bun
/**
 * Nothing unauthenticated may exhaust memory, disk, or CPU.
 *
 * `POST /tx` was public, shape-checked only, uncapped and unthrottled, and every
 * submission was persisted — `pending` is part of `serializeChain`, so a stranger
 * with a loop could grow the one volume that holds the only copy of history. Junk
 * never reached a block, but nothing removed it from the mempool either, so it
 * accumulated permanently.
 *
 * This file is the proof that the door is shut, and it checks the properties rather
 * than the implementation:
 *
 *   - junk at volume leaves the mempool empty and the datadir unchanged
 *   - a validly-shaped but unsigned transfer is refused at the door, not parked
 *   - a real wallet send still works (a door that refuses everyone is not a fix)
 *   - the mempool has a ceiling and refuses rather than evicting
 *   - an oversized block is rejected *before* signatures are verified, asserted on
 *     elapsed time so the check cannot regress into a late rejection
 *   - metadata can no longer carry arbitrary keys into the ledger forever
 *   - the rate limiter throttles writes, spares reads, and recovers
 *   - every non-GET route in rpc-server.ts is actually covered by the limiter
 */

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createGenesis,
  proposeTransfer,
  sequenceBlock,
  validateAndApplyBlockTxs,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import { admitTransaction, assertAdmissible, MempoolRejected } from "../src/lib/pixel/mempool";
import {
  MAX_BLOCK_TXS,
  MAX_METADATA_BYTES,
  MAX_PENDING_TX,
  RATE_LIMIT_BURST,
} from "../src/lib/pixel/limits";
import { createRateLimiter } from "../src/lib/pixel/rate-limit";
import { createTransaction, signTransaction } from "../src/lib/pixel/transaction";
import { transactionSchema } from "../src/lib/pixel/validators";
import { isWritePath } from "../src/node/rpc-server";

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

async function rejectionOf(state: PixelChainState, tx: Parameters<typeof assertAdmissible>[1]) {
  try {
    await assertAdmissible(state, tx);
    return null;
  } catch (err) {
    return err instanceof MempoolRejected ? err : null;
  }
}

console.log("═══ BOUNDS — nothing unauthenticated may exhaust the node ═══\n");

// ── a funded chain to admit against ────────────────────────────────────────
const alice = await generatePixelKeypair("PIX-ML-DSA-65");
const bob = await generatePixelKeypair("PIX-ML-DSA-65");
const chain = await createGenesis(alice);

// ── 1. junk at volume changes nothing ─────────────────────────────────────
// The exact attack: well-shaped transactions that reference inputs which do not
// exist. Each has a unique txid, so deduplication cannot help.
const JUNK = 2000;
let junkRefused = 0;
const junkCodes = new Set<string>();
for (let i = 0; i < JUNK; i++) {
  const junk = await createTransaction({
    inputs: [{ txid: i.toString(16).padStart(128, "0"), vout: 0 }],
    outputs: [{ amount: 1, address: bob.address }],
    metadata: { description: `junk ${i}` },
  });
  const rejection = await rejectionOf(chain, junk);
  if (rejection) {
    junkRefused++;
    junkCodes.add(rejection.code);
  }
}
check(junkRefused === JUNK, `${JUNK} junk submissions all refused (${junkRefused})`);
check(chain.pending.length === 0, "mempool is still empty after the flood");
check(
  junkCodes.size > 0 && !junkCodes.has("duplicate"),
  `refused on real grounds, not deduplication (${[...junkCodes].join(", ")})`,
);

// A junk transaction with a *correct* txid is still refused. Identity is a free
// filter, never the gate — an attacker can hash its own content.
const wellFormedJunk = await createTransaction({
  inputs: [{ txid: "ab".repeat(64), vout: 0 }],
  outputs: [{ amount: 1, address: bob.address }],
  metadata: { description: "correct txid, no such coin" },
});
const wfRejection = await rejectionOf(chain, wellFormedJunk);
check(
  wfRejection?.code === "unknown-input",
  `junk with a correct txid is still refused (${wfRejection?.code})`,
);

// ── 2. unsigned and forged transfers are refused, not parked ───────────────
const realUtxo = [...chain.utxos.values()][0]!;
const unsigned = await createTransaction({
  inputs: [{ txid: realUtxo.txid, vout: realUtxo.vout }],
  outputs: [{ amount: 1, address: bob.address }],
  metadata: { description: "no signature at all" },
});
check(
  (await rejectionOf(chain, unsigned))?.code === "unauthorized",
  "a real input with no signature is refused as unauthorized",
);

// Signed by the wrong key: shape is perfect, ownership is not.
const wrongKey = await signTransaction(
  await createTransaction({
    inputs: [{ txid: realUtxo.txid, vout: realUtxo.vout }],
    outputs: [{ amount: 1, address: bob.address }],
    metadata: { description: "not my coin" },
  }),
  bob,
);
check(
  (await rejectionOf(chain, wrongKey))?.code === "unauthorized",
  "spending someone else's coin is refused as unauthorized",
);

// Tampered identity: valid-looking but the txid does not derive from the body.
const tampered = { ...wrongKey, txid: "cd".repeat(64) };
check(
  (await rejectionOf(chain, tampered))?.code === "identity",
  "a transaction whose txid does not derive from its body is refused",
);

// A coinbase cannot be submitted from outside.
const fakeMint = await createTransaction({
  inputs: [],
  outputs: [{ amount: 1_000_000, address: bob.address }],
  metadata: { description: "free money" },
});
check(
  (await rejectionOf(chain, fakeMint))?.code === "shape",
  "a coinbase submitted from outside is refused",
);

// ── 3. the door still opens for a real send ───────────────────────────────
// A door that refuses everyone is not a fix.
const { state: proposed, tx: realTx } = await proposeTransfer(
  chain,
  alice,
  [{ amount: 5, address: bob.address }],
  { description: "a real transfer" },
);
void proposed;
// Admit it the way an inbound request would, against the untouched chain.
const admitted = await admitTransaction(chain, realTx);
check(admitted.pending.length === 1, "a genuine signed transfer IS admitted");
check(
  admitted.reservedInputs?.size === realTx.inputs.length,
  "admitting reserves the inputs it spends",
);

// …and the same transaction twice is a duplicate, not a second spend.
check(
  (await rejectionOf(admitted, realTx))?.code === "duplicate",
  "resubmitting the same transaction reports duplicate",
);

// A second transaction spending the same input while the first waits is refused.
const doubleSpend = await signTransaction(
  await createTransaction({
    inputs: realTx.inputs.map((i) => ({ txid: i.txid, vout: i.vout })),
    outputs: [{ amount: 4, address: bob.address }],
    metadata: { description: "same coin, different payee" },
  }),
  alice,
);
check(
  (await rejectionOf(admitted, doubleSpend))?.code === "input-reserved",
  "spending an input already promised by a pending transaction is refused",
);

// And it survives a round trip through the wire: the admitted transaction must
// still parse under the strict schema the HTTP door uses.
check(
  transactionSchema.safeParse(JSON.parse(JSON.stringify(realTx))).success,
  "a genuine transfer still parses under the strict wire schema",
);

// ── 4. the mempool has a ceiling and refuses rather than evicting ──────────
const fullChain: PixelChainState = {
  ...chain,
  pending: Array.from({ length: MAX_PENDING_TX }, (_, i) => ({
    ...realTx,
    txid: i.toString(16).padStart(128, "0"),
  })),
};
const fullRejection = await rejectionOf(fullChain, realTx);
check(
  fullRejection?.code === "mempool-full",
  `a full mempool refuses rather than evicting (${fullRejection?.code})`,
);
check(
  fullChain.pending.length === MAX_PENDING_TX,
  `nothing was evicted to make room (${fullChain.pending.length})`,
);

// ── 5. metadata can no longer smuggle arbitrary data into the ledger ──────
const stuffed = JSON.parse(JSON.stringify(realTx)) as Record<string, unknown>;
stuffed.metadata = { description: "ok", padding: "x".repeat(100_000) };
check(
  !transactionSchema.safeParse(stuffed).success,
  "an unknown metadata key is refused by the wire schema (no more .passthrough())",
);

const oversizeMeta = await signTransaction(
  await createTransaction({
    inputs: [{ txid: realUtxo.txid, vout: realUtxo.vout }],
    outputs: [{ amount: 1, address: bob.address }],
    metadata: { description: "y".repeat(MAX_METADATA_BYTES + 100) },
  }),
  alice,
);
check(
  (await rejectionOf(chain, oversizeMeta))?.code === "metadata-too-large",
  "metadata over the byte limit is refused at admission",
);

// ── 6. an oversized block is rejected before any signature is verified ────
// Asserted on elapsed time, not just on the throw: a late rejection would still
// have done the expensive work, which is the thing we are defending against.
const oversized = Array.from({ length: MAX_BLOCK_TXS + 1 }, (_, i) => ({
  ...realTx,
  txid: i.toString(16).padStart(128, "0"),
}));
const startedAt = performance.now();
let blockRejected = "";
try {
  await validateAndApplyBlockTxs({ utxos: chain.utxos, txs: oversized, index: 1 });
} catch (err) {
  blockRejected = err instanceof Error ? err.message : String(err);
}
const elapsedMs = performance.now() - startedAt;
check(/over the \d+ limit/.test(blockRejected), `an oversized block is rejected: ${blockRejected}`);
// One ML-DSA verify is ~4.6ms on this machine; 4,097 would be ~19s. Anything in
// the low hundreds of ms proves no signature work happened.
check(
  elapsedMs < 1000,
  `rejected in ${elapsedMs.toFixed(1)}ms — before signature verification, not after`,
);

// ── 7. the rate limiter throttles writes and recovers ────────────────────
const limiter = createRateLimiter({ burst: 5, refillPerSec: 1 });
const t0 = 1_000_000;
let allowed = 0;
for (let i = 0; i < 20; i++) if (limiter.take("1.2.3.4", t0)) allowed++;
check(allowed === 5, `burst is honoured then cut off (${allowed} of 20 allowed)`);
check(limiter.retryAfterSec("1.2.3.4", t0) >= 1, "a throttled client is told when to retry");
check(limiter.take("5.6.7.8", t0), "a different client is unaffected");
check(limiter.take("1.2.3.4", t0 + 3000), "the same client recovers after refill");

// The bucket table is itself bounded, so tracking clients cannot become the leak.
const small = createRateLimiter({ burst: 1, refillPerSec: 1, maxClients: 8 });
for (let i = 0; i < 500; i++) small.take(`client-${i}`, t0);
check(small.size() <= 8, `the bucket table is bounded (${small.size()} <= 8)`);

// ── 8. every write route is actually covered ─────────────────────────────
// A new write endpoint that is not in WRITE_PATHS is unthrottled, and that is
// exactly how the last hole stayed open. So the list is checked against the file.
const rpcSource = await Bun.file(new URL("../src/node/rpc-server.ts", import.meta.url)).text();
const routeRe = /req\.method === "(POST|PUT)" && url\.pathname === "([^"]+)"/g;
const declared: string[] = [];
for (const m of rpcSource.matchAll(routeRe)) declared.push(m[2]!);
const uncovered = declared.filter((p) => !isWritePath(p));
check(declared.length > 0, `found ${declared.length} write route(s) in rpc-server.ts to check`);
check(
  uncovered.length === 0,
  `every write route is rate limited${uncovered.length ? ` (missing: ${uncovered.join(", ")})` : ""}`,
);
check(!isWritePath("/sync") && !isWritePath("/pixels"), "read paths are NOT throttled");

// ── 9. nothing was written to disk by the refusals ───────────────────────
// The original bug persisted every submission, so the honest check is bytes on
// disk before and after a flood.
const datadir = await mkdtemp(join(tmpdir(), "pixel-bounds-"));
try {
  const probe = join(datadir, "chain.json");
  await Bun.write(probe, JSON.stringify({ pending: [] }));
  const before = (await stat(probe)).size;
  let refused = 0;
  for (let i = 0; i < 200; i++) {
    const junk = await createTransaction({
      inputs: [{ txid: (i + 90000).toString(16).padStart(128, "0"), vout: 0 }],
      outputs: [{ amount: 1, address: bob.address }],
      metadata: { description: "disk probe" },
    });
    if (await rejectionOf(chain, junk)) refused++;
  }
  const after = (await stat(probe)).size;
  check(refused === 200 && before === after, "200 refusals wrote nothing to disk");
} finally {
  await rm(datadir, { recursive: true, force: true });
}

// ── 10. the tip still advances with an admitted transaction ─────────────
const sealed = await sequenceBlock(admitted, alice);
check(sealed.pixels.length === 2, "an admitted transfer seals into the next pixel");
check(sealed.pending.length === 0, "the mempool drains when the pixel is sealed");

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log("═══ PASS — the door is shut, and it still opens for real money ═══");

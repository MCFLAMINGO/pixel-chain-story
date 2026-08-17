#!/usr/bin/env bun
/**
 * The gossip wire must be as strict a door as HTTP.
 *
 * HTTP validated with zod and capped its body. The wire did `JSON.parse` and a cast
 * to `PeerMessage`, which is a promise to the type checker and nothing at all to a
 * peer. The asymmetry mattered more than it looks, because gossip carries a strict
 * superset of what HTTP carries: `/tx` takes a transaction, the wire takes a
 * transaction *and* whole blocks. Every protection added at the HTTP door was
 * therefore absent on the path a peer uses.
 *
 * What is asserted here:
 *
 *   - every message type in the `PeerMessage` union has a schema, checked
 *     exhaustively so a new variant cannot arrive unvalidated
 *   - malformed frames are refused with a reason, and never by throwing
 *   - oversized frames are refused before `JSON.parse`
 *   - a junk `tx` over the wire does not reach the mempool
 *   - a `hello` carrying thousands of sequencers does not grow state
 *   - real messages still pass, including a real block from the crowned chain
 */

import {
  parseWireFrame,
  parseWireMessage,
  peerMessageSchema,
  ledgerPixelSchema,
  WIRE_MESSAGE_TYPES,
} from "../src/lib/pixel/wire-schema";
import {
  MAX_BLOCK_TX_BYTES,
  MAX_GOSSIP_FRAME_BYTES,
  MAX_HELLO_SEQUENCERS,
  MAX_PIXEL_PAGE_BYTES,
  MAX_PIXELS_PER_MESSAGE,
  pixelPage,
} from "../src/lib/pixel/limits";
import { assertAdmissible, MempoolRejected } from "../src/lib/pixel/mempool";
import { createGenesis, type LedgerPixel } from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import {
  createTransaction,
  signTransaction,
  txIdentityProblem,
  verifySignatureShapeOnly,
} from "../src/lib/pixel/transaction";

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

console.log("═══ WIRE SCHEMA — the gossip door ═══\n");

// ── 1. every PeerMessage variant has a schema ──────────────────────────────
// Read the union straight out of p2p.ts. A new variant added there without a
// schema here would otherwise be silently unvalidated, which is the whole bug.
const p2pSource = await Bun.file(new URL("../src/node/p2p.ts", import.meta.url)).text();
const declaredTypes = [...p2pSource.matchAll(/type:\s*"([a-z_]+)"/g)].map((m) => m[1]!);
const declared = [...new Set(declaredTypes)];
const covered = new Set<string>(WIRE_MESSAGE_TYPES);
const missing = declared.filter((t) => !covered.has(t));
check(declared.length >= 10, `found ${declared.length} message type(s) declared in p2p.ts`);
check(
  missing.length === 0,
  `every declared message type has a schema${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`,
);
const stale = [...covered].filter((t) => !declared.includes(t));
check(stale.length === 0, `no schema for a message type that no longer exists (${stale.length})`);

// ── 2. malformed frames are refused, never thrown ──────────────────────────
const malformed: Array<[string, string]> = [
  ["not json at all", "{{{"],
  ["empty string", ""],
  ["json but not an object", "42"],
  ["null", "null"],
  ["unknown type", JSON.stringify({ type: "definitely-not-a-message" })],
  ["missing type", JSON.stringify({ tx: {} })],
  ["tx with no transaction", JSON.stringify({ type: "tx" })],
  ["pixel with no block", JSON.stringify({ type: "pixel" })],
  [
    "hello with a bad address",
    JSON.stringify({ type: "hello", nodeId: "x", address: "nope", tip: 0, tipHash: "ab" }),
  ],
  ["get_pixels with a negative from", JSON.stringify({ type: "get_pixels", from: -5 })],
  ["get_pixels with a string from", JSON.stringify({ type: "get_pixels", from: "1" })],
  ["ping with extra keys", JSON.stringify({ type: "ping", t: 1, extra: "x" })],
  [
    "pixels array too long",
    JSON.stringify({ type: "pixels", pixels: new Array(MAX_PIXELS_PER_MESSAGE + 1).fill({}) }),
  ],
];
let refused = 0;
let threw = 0;
for (const [label, raw] of malformed) {
  let result: ReturnType<typeof parseWireFrame>;
  try {
    result = parseWireFrame(raw, MAX_GOSSIP_FRAME_BYTES);
  } catch {
    threw++;
    console.error(`  ✗ threw on: ${label}`);
    continue;
  }
  if (!result.ok) refused++;
  else console.error(`  ✗ ACCEPTED: ${label}`);
}
check(
  refused === malformed.length,
  `all ${malformed.length} malformed frames refused (${refused})`,
);
check(threw === 0, "no malformed frame raised an exception through the handler");

// ── 3. oversized frames die before JSON.parse ─────────────────────────────
// The payload is deliberately valid JSON, so the only thing that can refuse it is
// the length check — which proves the length check ran first.
const huge = JSON.stringify({ type: "ping", t: 1, pad: "x".repeat(MAX_GOSSIP_FRAME_BYTES) });
const hugeStart = performance.now();
const hugeResult = parseWireFrame(huge, MAX_GOSSIP_FRAME_BYTES);
const hugeMs = performance.now() - hugeStart;
check(!hugeResult.ok, "an oversized frame is refused");
check(
  !hugeResult.ok && /over the \d+ limit/.test(hugeResult.reason),
  "refused on size, before parsing — not on shape afterwards",
);
check(hugeMs < 50, `size check is O(1)-ish: ${hugeMs.toFixed(2)}ms`);

// ── 4. a junk tx over the wire does not reach the mempool ────────────────
const alice = await generatePixelKeypair("PIX-ML-DSA-65");
const bob = await generatePixelKeypair("PIX-ML-DSA-65");
const chain = await createGenesis(alice);

const junkTx = await createTransaction({
  inputs: [{ txid: "ff".repeat(64), vout: 0 }],
  outputs: [{ amount: 1, address: bob.address }],
  metadata: { description: "over the wire" },
});
const junkFrame = JSON.stringify({ type: "tx", tx: junkTx });
const junkParsed = parseWireFrame(junkFrame, MAX_GOSSIP_FRAME_BYTES);
// Structurally fine — a well-formed transaction really is a well-formed message.
// The schema is not supposed to know whose coin it is; that is the mempool's job.
check(junkParsed.ok, "a well-formed junk tx passes the SCHEMA (shape is not truth)");
let mempoolRefused = false;
try {
  await assertAdmissible(chain, junkTx);
} catch (err) {
  mempoolRefused = err instanceof MempoolRejected;
}
check(mempoolRefused, "…and is then refused by the same mempool door as HTTP /tx");

// A tx with metadata smuggling is refused at the schema, before the mempool.
const stuffedFrame = JSON.stringify({
  type: "tx",
  tx: { ...junkTx, metadata: { description: "ok", sneaky: "x".repeat(1000) } },
});
check(
  !parseWireFrame(stuffedFrame, MAX_GOSSIP_FRAME_BYTES).ok,
  "a tx with unknown metadata keys is refused at the wire, before the mempool",
);

// ── 5. a hello cannot be a memory bucket ────────────────────────────────
const floodHello = JSON.stringify({
  type: "hello",
  nodeId: "flood",
  address: alice.address,
  tip: 0,
  tipHash: "ab".repeat(64),
  sequencers: Array.from({ length: MAX_HELLO_SEQUENCERS + 500 }, () => ({
    address: bob.address,
    publicKey: "cd".repeat(32),
  })),
});
check(
  !parseWireFrame(floodHello, MAX_GOSSIP_FRAME_BYTES).ok,
  `a hello with ${MAX_HELLO_SEQUENCERS + 500} sequencers is refused`,
);

// ── 6. real messages still pass ────────────────────────────────────────
// The honest test of a schema is not that it rejects things: it is that it accepts
// reality. A real block from the crowned chain must validate unchanged.
const fx = JSON.parse(
  await Bun.file(new URL("../fixtures/crowned-47.json", import.meta.url)).text(),
) as { pixels: LedgerPixel[] };
let realBlocksOk = 0;
const blockFailures: string[] = [];
for (const px of fx.pixels) {
  const parsed = ledgerPixelSchema.safeParse(JSON.parse(JSON.stringify(px)));
  if (parsed.success) realBlocksOk++;
  else if (blockFailures.length < 3) {
    blockFailures.push(
      `#${px.index}: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`,
    );
  }
}
check(
  realBlocksOk === fx.pixels.length,
  `all ${fx.pixels.length} real crowned blocks validate${blockFailures.length ? ` — ${blockFailures.join("; ")}` : ""}`,
);

const realPixelFrame = JSON.stringify({ type: "pixel", pixel: fx.pixels[20] });
check(
  parseWireFrame(realPixelFrame, MAX_GOSSIP_FRAME_BYTES).ok,
  "a real block travels as a `pixel` message",
);
check(
  parseWireFrame(
    JSON.stringify({ type: "pixels", pixels: fx.pixels.slice(0, 10) }),
    MAX_GOSSIP_FRAME_BYTES,
  ).ok,
  "a real batch travels as a `pixels` message",
);

const realTx = await signTransaction(
  await createTransaction({
    inputs: [{ txid: "11".repeat(64), vout: 0 }],
    outputs: [{ amount: 1, address: bob.address }],
    metadata: { description: "signed", reference: "REF-1", kind: "gift" },
  }),
  alice,
);
check(
  parseWireFrame(JSON.stringify({ type: "tx", tx: realTx }), MAX_GOSSIP_FRAME_BYTES).ok,
  "a real signed transaction travels, including metadata.kind",
);

for (const msg of [
  { type: "ping", t: Date.now() },
  { type: "pong", t: Date.now() },
  { type: "get_pixels", from: 0 },
  { type: "get_headers", from: 3 },
  {
    type: "hello",
    nodeId: "abc",
    address: alice.address,
    tip: 5,
    tipHash: "ab".repeat(64),
    publicKey: alice.publicKey,
    gossipUrl: "ws://127.0.0.1:9001/gossip",
  },
]) {
  check(
    peerMessageSchema.safeParse(msg).success,
    `real ${(msg as { type: string }).type} message validates`,
  );
}

// ── 7. validate-only: the schema must not rewrite what it validates ──────
// The first version of parseWireFrame returned zod's rebuilt object and broke
// multi-node sync outright. Zod reconstructs objects in schema declaration order,
// and canonicalTxBody signs JSON.stringify of the transaction — so handing on zod's
// output silently rewrites the bytes a signature covers. Every gossiped transaction
// failed its identity check and every relayed block failed authorization.
//
// The property is byte identity, so that is what is asserted.
const orderedTx = await signTransaction(
  await createTransaction({
    // reference before description: the opposite of schema declaration order, which
    // is precisely the case a rebuilt object would silently reorder.
    inputs: [{ txid: "22".repeat(64), vout: 0 }],
    outputs: [{ amount: 3, address: bob.address }],
    metadata: { reference: "REF-ORDER", description: "order matters" },
  }),
  alice,
);
const orderedRaw = JSON.stringify({ type: "tx", tx: orderedTx });
const orderedParsed = parseWireFrame(orderedRaw, MAX_GOSSIP_FRAME_BYTES);
check(orderedParsed.ok, "a transaction with non-schema key order passes the wire");
check(
  orderedParsed.ok && JSON.stringify(orderedParsed.value) === orderedRaw,
  "parseWireFrame returns byte-identical JSON — it validates, it does not rewrite",
);

// And the consequence that actually matters: identity survives the round trip.
const roundTripped = orderedParsed.ok
  ? (orderedParsed.value as { tx: typeof orderedTx }).tx
  : orderedTx;
check(
  (await txIdentityProblem(roundTripped)) === null,
  "transaction identity survives the wire round trip",
);
check(
  await verifySignatureShapeOnly(roundTripped),
  "the signature still verifies after the wire round trip",
);

// Same for a whole block: a relayed pixel's transactions must verify unchanged.
const blockRaw = JSON.stringify({ type: "pixel", pixel: fx.pixels[20] });
const blockParsed = parseWireFrame(blockRaw, MAX_GOSSIP_FRAME_BYTES);
check(
  blockParsed.ok && JSON.stringify(blockParsed.value) === blockRaw,
  "a relayed block is byte-identical after validation",
);

// ── 8. paging is bounded by bytes, not just by count ─────────────────────
// A count alone does not bound a page: real pixels run ~29 KB each, so 512 of them
// is roughly 15 MB — far over any sane frame. The first version of this bounded only
// the count, which would have produced frames the receiver refuses as oversized.
const pageResult = pixelPage(fx.pixels, 0, { maxBytes: 100_000 });
const pageBytes = JSON.stringify(pageResult.page).length;
check(pageResult.page.length < fx.pixels.length, "a byte budget ends the page early");
check(pageBytes <= 100_000 + 50_000, `page respects the byte budget (${pageBytes} bytes)`);
check(pageResult.hasMore, "a truncated page reports hasMore");
check(
  pageResult.nextFrom === pageResult.page.length,
  "nextFrom points at the first pixel not sent",
);

// Every page must fit in a frame — otherwise catch-up sends what the peer refuses.
const fullPage = pixelPage(fx.pixels, 0);
const fullFrame = JSON.stringify({ type: "pixels", pixels: fullPage.page });
check(
  fullFrame.length <= MAX_GOSSIP_FRAME_BYTES,
  `a default page fits in a frame (${fullFrame.length} <= ${MAX_GOSSIP_FRAME_BYTES})`,
);
check(parseWireFrame(fullFrame, MAX_GOSSIP_FRAME_BYTES).ok, "and the receiver accepts it");

// A single pixel is always deliverable even if it alone busts the budget: a block
// consensus accepts but the wire cannot carry would be a chain that cannot
// replicate itself.
const tiny = pixelPage(fx.pixels, 0, { maxBytes: 1 });
check(tiny.page.length === 1, "a single oversized pixel is still sent (never zero progress)");

// Paging walks the whole chain rather than stalling.
let cursor = 0;
let pages = 0;
const walked: number[] = [];
while (cursor < fx.pixels.length && pages < 1000) {
  const p = pixelPage(fx.pixels, cursor, { maxBytes: 60_000 });
  if (p.page.length === 0) break;
  for (const px of p.page) walked.push(px.index);
  cursor = p.nextFrom;
  pages++;
}
check(
  walked.length === fx.pixels.length,
  `paging walks the whole chain in ${pages} pages (${walked.length}/${fx.pixels.length})`,
);
check(
  walked.every((idx, i) => idx === fx.pixels[i]!.index),
  "paged pixels arrive in order with no gaps or repeats",
);

// The frame budget must clear the largest legal block, or a valid block could
// exist that cannot be gossiped.
check(
  MAX_GOSSIP_FRAME_BYTES > MAX_BLOCK_TX_BYTES,
  `frame budget (${MAX_GOSSIP_FRAME_BYTES}) clears the largest legal block (${MAX_BLOCK_TX_BYTES})`,
);
check(MAX_PIXEL_PAGE_BYTES <= MAX_GOSSIP_FRAME_BYTES, "a full page always fits inside a frame");

// ── 9. sealed payloads are shape-checked after opening ────────────────
// A sealed frame is authenticated, not trusted: the peer that sealed it is still a
// peer. `parseWireMessage` is what the gossip handler runs on the opened payload.
check(
  !parseWireMessage({ type: "tx" }).ok,
  "an opened sealed payload with a missing field is refused",
);
check(
  parseWireMessage({ type: "ping", t: 1 }).ok,
  "an opened sealed payload that is well formed is accepted",
);

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log("═══ PASS — the wire is the same door as HTTP ═══");

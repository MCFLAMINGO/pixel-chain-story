/**
 * Schemas for the gossip wire.
 *
 * ## Why this did not exist
 *
 * The HTTP surface has always validated: `transactionSchema`, `jsonRpcRequestSchema`,
 * a body-size cap, typed errors. The gossip surface did `JSON.parse` and a cast to
 * `PeerMessage`, which is a promise to TypeScript and nothing at all to a peer.
 *
 * That asymmetry is worse than an oversight, because gossip carries a strict superset
 * of what HTTP carries. `/tx` accepts a transaction; gossip accepts a transaction
 * *and* whole blocks. So every protection added at the HTTP door was absent on the
 * path a peer uses — the same flood, a different port. Hardening one and not the
 * other would have been theatre, which is why the wire schema ships in the same
 * breath as the mempool door.
 *
 * ## What a schema is and is not doing here
 *
 * Structural validation only: is this the shape of a message, and is it small enough
 * to be worth looking at? Whether the *contents* are true stays where it belongs —
 * `acceptBlock` decides whether a block is valid, `assertAdmissible` decides whether
 * a transaction may be held. A schema that started making those judgements would be
 * a second consensus implementation, and two implementations of one rule is how a
 * fork happens.
 *
 * The point is to make malformed input cheap to refuse, so a peer cannot reach the
 * expensive paths with garbage, and cannot crash a handler with a missing field.
 */

import { z } from "zod";
import {
  MAX_BLOCK_TXS,
  MAX_GOSSIP_FRAME_BYTES,
  MAX_HELLO_SEQUENCERS,
  MAX_PIXELS_PER_MESSAGE,
} from "./limits";
import { blockTransactionSchema, transactionSchema } from "./validators";

/**
 * Hex with an explicit ceiling, because hex without one is a memory budget.
 *
 * A factory rather than a base schema with `.max()` chained on top: zod's `.max()`
 * *adds* a constraint instead of replacing the previous one, so `hex.max(bigger)`
 * silently keeps the smaller limit. That is not theoretical — the first version of
 * this file capped sealed ciphertext that way and broke ML-KEM sealed gossip, since
 * a sealed block is far larger than 16 KB and every frame was refused as too long.
 */
const hexUpTo = (maxChars: number) =>
  z
    .string()
    .regex(/^[0-9a-fA-F]+$/, "expected hex")
    .max(maxChars);

/** Default ceiling — comfortably over an ML-DSA-65 public key (3,904 chars). */
const hex = hexUpTo(16_384);

const address = z.string().regex(/^pix1[a-f0-9]{38}$/, "invalid pix1 address");

const sequencerIdSchema = z
  .object({
    address,
    publicKey: hex,
    label: z.string().max(128).optional(),
  })
  .strict();

const colorSchema = z
  .object({
    r: z.number().int().min(0).max(255),
    g: z.number().int().min(0).max(255),
    b: z.number().int().min(0).max(255),
  })
  .strict();

/** Mirrors `FieldWitness` in field-witness.ts. Strict, so a shape change is loud. */
const fieldWitnessSchema = z
  .object({
    peerIndex: z.number().int(),
    distance: z.number(),
    opacity: z.enum(["opaque", "translucent", "lit"]),
    /** Empty when opaque, `#rrggbb` otherwise. */
    color: z.string().max(32),
    x: z.number(),
    y: z.number(),
    z: z.number(),
    weight: z.number(),
  })
  .strict();

/** Mirrors `WaveHit` in wave.ts. */
const waveHitSchema = z
  .object({
    cellIndex: z.number().int(),
    hop: z.number().int(),
    amplitudeMilli: z.number(),
    leadIndex: z.number().int(),
  })
  .strict();

const lightProofSchema = z
  .object({
    sequence: z.number().int().min(0),
    sequencerAddress: address,
    sequencerPublicKey: hex,
    scheme: z.enum(["PIX-HASH-OTS-128", "PIX-ML-DSA-65"]).optional(),
    beacon: hex,
    prevHash: hex,
    /** A signature envelope is JSON-in-a-string; the scheme layer parses it. */
    signature: z.string().max(262_144),
    revealedAt: z.number().finite(),
    skipCount: z.number().int().min(0).max(64).optional(),
    electable: z.array(address).max(4096).optional(),
    fieldDigest: hex,
    waveDigest: hex,
    spatialRoot: hex,
  })
  .strict();

/**
 * A block, structurally.
 *
 * `field` and `wave` are permissive here on purpose: T1.9 makes `acceptBlock`
 * recompute and compare them, and a rule that lives in two places drifts. The
 * schema bounds their size; consensus decides their content.
 */
export const ledgerPixelSchema = z
  .object({
    index: z.number().int().min(0),
    prevHash: hex,
    merkleRoot: hex,
    sequence: z.number().int().min(0),
    lightProof: lightProofSchema,
    transactions: z.array(blockTransactionSchema).min(1).max(MAX_BLOCK_TXS),
    timestamp: z.number().finite(),
    hash: hex,
    color: colorSchema,
    illuminated: z.boolean(),
    proximity: z.array(z.number().int()).max(4096),
    field: z.array(fieldWitnessSchema).max(4096),
    wave: z.array(waveHitSchema).max(4096).optional(),
  })
  .strict();

const pixelHeaderSchema = z
  .object({
    index: z.number().int().min(0),
    prevHash: hex,
    merkleRoot: hex,
    sequence: z.number().int().min(0),
    timestamp: z.number().finite(),
    hash: hex,
    lightProof: lightProofSchema,
  })
  .passthrough();

export const peerMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("hello"),
      nodeId: z.string().max(128),
      address,
      tip: z.number().int().min(-1),
      tipHash: hex,
      gossipUrl: z.string().max(512).optional(),
      publicKey: hex.optional(),
      /**
       * Display metadata, not authority. After T1.1 the electable set is a fold
       * over chain history, so a hello cannot change who may produce — but an
       * unbounded array is still a bucket of someone else's memory.
       */
      sequencers: z.array(sequencerIdSchema).max(MAX_HELLO_SEQUENCERS).optional(),
      helloSig: z.string().max(262_144).optional(),
      kemPublicKey: hex.optional(),
      kemScheme: z.literal("PIX-ML-KEM-768").optional(),
    })
    .strict(),
  z.object({ type: z.literal("ping"), t: z.number().finite() }).strict(),
  z.object({ type: z.literal("pong"), t: z.number().finite() }).strict(),
  z.object({ type: z.literal("tx"), tx: transactionSchema }).strict(),
  z.object({ type: z.literal("pixel"), pixel: ledgerPixelSchema }).strict(),
  z.object({ type: z.literal("get_pixels"), from: z.number().int().min(0) }).strict(),
  z
    .object({
      type: z.literal("pixels"),
      pixels: z.array(ledgerPixelSchema).max(MAX_PIXELS_PER_MESSAGE),
    })
    .strict(),
  z.object({ type: z.literal("get_headers"), from: z.number().int().min(0) }).strict(),
  z
    .object({
      type: z.literal("headers"),
      headers: z.array(pixelHeaderSchema).max(MAX_PIXELS_PER_MESSAGE),
    })
    .strict(),
  z
    .object({
      type: z.literal("kem_session"),
      kemCt: hex,
      fromAddress: address,
      kemScheme: z.literal("PIX-ML-KEM-768"),
    })
    .strict(),
  z
    .object({
      type: z.literal("sealed"),
      nonce: hex,
      // A sealed frame can carry a whole block, so this ceiling is the frame
      // budget rather than the field budget.
      ciphertext: hexUpTo(MAX_GOSSIP_FRAME_BYTES * 2),
      kemScheme: z.literal("PIX-ML-KEM-768"),
    })
    .strict(),
]);

/**
 * Every `type` the schema knows. Exported so a selftest can assert the union
 * covers the whole `PeerMessage` type — a new message variant without a schema
 * would otherwise be silently unvalidated, which is the bug this file fixes.
 */
export const WIRE_MESSAGE_TYPES = [
  "hello",
  "ping",
  "pong",
  "tx",
  "pixel",
  "get_pixels",
  "pixels",
  "get_headers",
  "headers",
  "kem_session",
  "sealed",
] as const;

export type WireParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

function shapeProblem(value: unknown): string | null {
  const parsed = peerMessageSchema.safeParse(value);
  if (parsed.success) return null;
  const first = parsed.error.issues[0];
  const where = first?.path?.length ? first.path.join(".") : "message";
  return `${where}: ${first?.message ?? "invalid shape"}`;
}

/**
 * Parse one gossip frame: size first, then JSON, then shape.
 *
 * Size is checked on the raw string **before** `JSON.parse`, because parsing is where
 * an attacker gets leverage. Never throws — a peer must not be able to raise an
 * exception through a socket handler — so callers get a reason they can score on.
 *
 * ## Validate-only, and this is load-bearing
 *
 * Returns the value from `JSON.parse`, **never zod's rebuilt object**, exactly as
 * `parseJsonWithSchema` in `validators.ts` has always done. Zod reconstructs objects
 * in schema declaration order, and `canonicalTxBody` signs `JSON.stringify` of the
 * transaction — so handing on zod's output silently rewrites the bytes a signature
 * covers. The first version of this function returned `parsed.data` and broke
 * multi-node sync outright: every gossiped transaction failed its identity check and
 * every relayed block failed authorization, because the body being verified was no
 * longer the body that was signed.
 *
 * A schema decides whether input may be looked at. It must not decide what the input
 * *is*.
 */
export function parseWireFrame(raw: string, maxBytes: number): WireParseResult<unknown> {
  if (raw.length > maxBytes) {
    return { ok: false, reason: `frame is ${raw.length} bytes, over the ${maxBytes} limit` };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: `not JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  const problem = shapeProblem(json);
  if (problem) return { ok: false, reason: problem };
  // The original parse, byte-preserving. See the note above.
  return { ok: true, value: json };
}

/**
 * Shape-check an already-decoded object — used for sealed frames after opening.
 *
 * Validate-only for the same reason as `parseWireFrame`: the caller gets its own
 * object back, not a reconstruction of it.
 */
export function parseWireMessage(value: unknown): WireParseResult<unknown> {
  const problem = shapeProblem(value);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, value };
}

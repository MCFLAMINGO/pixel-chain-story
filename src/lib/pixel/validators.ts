/**
 * Input schema validation — Gate I hardening.
 *
 * Reject oversized / malformed JSON before crypto work. Used at signature
 * parse sites and RPC entry points. Dream ≠ claim: this is DoS / schema
 * hygiene, not a full audit.
 */

import { z } from "zod";

/** Keep in sync with crypto.ts — duplicated to avoid import cycles. */
const OTS_LEAF_COUNT = 32;
const OTS_AUTH_DEPTH = 5; // log2(OTS_LEAF_COUNT)
const OTS_MSG_BITS = 256;

/** Max bytes for a signature JSON envelope (OTS ≈35KB at 256 bits; ML-DSA ≈7KB). */
export const MAX_SIGNATURE_JSON_BYTES = 65_536; // 64 KiB

/** Max bytes for POST /tx or POST /rpc request bodies. */
export const MAX_RPC_BODY_BYTES = 1_048_576; // 1 MiB (wider OTS envelopes)

/** Max hex length for a public key / digest field (ML-DSA pk is large). */
const MAX_HEX_FIELD = 16_384;

const hexString = z
  .string()
  .regex(/^[0-9a-fA-F]+$/, "expected hex")
  .max(MAX_HEX_FIELD);

const pixAddress = z.string().regex(/^pix1[a-f0-9]{38}$/, "invalid pix1 address");

/** PIX-HASH-OTS-128 envelope (Lamport leaf + Merkle auth). */
export const otsSignatureSchema = z
  .object({
    alg: z.literal("PIX-HASH-OTS-128"),
    leafIndex: z
      .number()
      .int()
      .min(0)
      .max(OTS_LEAF_COUNT - 1),
    leafPublicKey: hexString,
    // PIX-20: path length is exactly log2(OTS_LEAF_COUNT), never merely bounded.
    authPath: z.array(hexString).length(OTS_AUTH_DEPTH),
    // PIX-10: 256 signed bits, full 64-hex-char commitment halves.
    revealed: z.array(z.string().min(1).max(128)).length(OTS_MSG_BITS),
    complements: z.array(z.string().length(64)).length(OTS_MSG_BITS),
    /** Legacy weak field — presence alone does not validate. */
    pubCommit: z.string().optional(),
  })
  .strict();

/** PIX-ML-DSA-65 envelope. */
export const mldsaSignatureSchema = z
  .object({
    alg: z.literal("PIX-ML-DSA-65"),
    sig: hexString.min(64).max(MAX_HEX_FIELD),
  })
  .strict();

/** Discriminated signature envelope (OTS or ML-DSA). */
export const signatureEnvelopeSchema = z.union([otsSignatureSchema, mldsaSignatureSchema]);

/** Minimal peek for leaf-index extraction (OTS only). */
export const otsLeafPeekSchema = z.object({
  alg: z.string(),
  leafIndex: z.number().int().optional(),
});

export const txInputSchema = z.object({
  txid: z.string().min(1).max(256),
  vout: z.number().int().min(0).max(1_000_000),
  signature: z.string().max(MAX_SIGNATURE_JSON_BYTES).optional(),
  publicKey: hexString.optional(),
});

export const txOutputSchema = z.object({
  address: pixAddress,
  amount: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER),
});

export const transactionSchema = z.object({
  txid: z.string().min(1).max(256),
  inputs: z.array(txInputSchema).min(1).max(64),
  outputs: z.array(txOutputSchema).min(1).max(64),
  /**
   * Strict, not passthrough.
   *
   * `.passthrough()` accepted arbitrary unknown keys **and preserved them**, and
   * `canonicalTxBody` JSON-stringifies the whole metadata object — so junk was
   * signed, committed into the txid, and written into every copy of the chain
   * forever. It was also what let a single request approach the 1 MiB body cap
   * despite the sensible per-field limits right here.
   *
   * Safe against real history: no transaction on the crowned chain carries an
   * unknown metadata key and the largest metadata object is 136 bytes, both
   * asserted by `scripts/crowned-replay-selftest.ts`.
   */
  metadata: z
    .object({
      description: z.string().max(2048).optional(),
      recipientLabel: z.string().max(256).optional(),
      reference: z.string().max(256).optional(),
      /** Declared act, for the gift-and-record rules. */
      kind: z.enum(["gift", "record"]).optional(),
    })
    .strict(),
  commitment: hexString,
  state: z.enum(["superposition", "revealed", "final"]),
  privacy: z.enum(["public", "private", "selective"]).optional(),
  timestamp: z.number().finite(),
  lightSequence: z.number().int().optional(),
  revealedAt: z.number().finite().optional(),
});

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1).max(128),
  params: z.array(z.unknown()).max(32).optional(),
});

export type OtsSignature = z.infer<typeof otsSignatureSchema>;
export type MldsaSignature = z.infer<typeof mldsaSignatureSchema>;
export type ParsedTransaction = z.infer<typeof transactionSchema>;
export type ParsedJsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Reject before JSON.parse when the raw string is too large. */
export function assertJsonSize(raw: string, maxBytes: number, label = "JSON"): void {
  // UTF-16 length ≈ upper bound for ASCII-heavy hex/JSON; reject early.
  if (raw.length > maxBytes) {
    throw new ValidationError(`${label} exceeds ${maxBytes} bytes (got ${raw.length} chars)`);
  }
}

/**
 * Size-cap + JSON.parse + zod **validate-only**.
 *
 * Returns the original `JSON.parse` value (not zod's rebuilt object) so
 * key order in signed tx bodies (`canonicalTxBody`) is preserved. Zod object
 * parse would reorder keys (e.g. outputs `amount`/`address`) and break sigs.
 */
export function parseJsonWithSchema<T>(
  raw: string,
  schema: z.ZodType<T>,
  opts: { maxBytes: number; label?: string },
): T {
  assertJsonSize(raw, opts.maxBytes, opts.label ?? "JSON");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ValidationError(`${opts.label ?? "JSON"}: malformed JSON`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(`${opts.label ?? "JSON"}: schema rejected`, parsed.error.flatten());
  }
  return value as T;
}

/** Soft parse — returns null instead of throw (for verify paths). */
export function tryParseJsonWithSchema<T>(
  raw: string,
  schema: z.ZodType<T>,
  opts: { maxBytes: number },
): T | null {
  try {
    return parseJsonWithSchema(raw, schema, opts);
  } catch {
    return null;
  }
}

export function parseOtsSignatureJson(signatureJson: string): OtsSignature | null {
  return tryParseJsonWithSchema(signatureJson, otsSignatureSchema, {
    maxBytes: MAX_SIGNATURE_JSON_BYTES,
  });
}

export function parseMldsaSignatureJson(signatureJson: string): MldsaSignature | null {
  return tryParseJsonWithSchema(signatureJson, mldsaSignatureSchema, {
    maxBytes: MAX_SIGNATURE_JSON_BYTES,
  });
}

export function parseSignatureEnvelope(signatureJson: string) {
  return tryParseJsonWithSchema(signatureJson, signatureEnvelopeSchema, {
    maxBytes: MAX_SIGNATURE_JSON_BYTES,
  });
}

/** Read request body with a hard byte cap (avoids buffering huge uploads). */
export async function readBodyWithLimit(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const declared = req.headers.get("content-length");
  if (declared) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) {
      return { ok: false, error: `body exceeds ${maxBytes} bytes` };
    }
  }
  const reader = req.body?.getReader();
  if (!reader) return { ok: true, text: "" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return { ok: false, error: `body exceeds ${maxBytes} bytes` };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(buf) };
}

export function validatorsThesis(): string {
  return (
    "Zod schemas + byte caps at signature parse and RPC entry — reject oversized " +
    "JSON before crypto. Hygiene for public tip RPC; not a claim of audited L1."
  );
}

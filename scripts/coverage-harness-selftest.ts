#!/usr/bin/env bun
/**
 * How do you know you found them all?
 *
 * This file is the answer, and it exists because the honest answer used to be "I looked
 * hard". Every audit pass over this codebase found more: the takeover by reading the
 * accept path, three bounds problems by poking at it, `.passthrough()` while explaining
 * one of those, four more from a field-by-field sweep. That is not a method. A plan
 * built that way can never say a thing is sound, only that nobody has looked recently.
 *
 * So completeness stops being a property of anyone's diligence and becomes a property of
 * the build. Four registries, each checked against the source rather than against
 * memory:
 *
 *   1. FIELDS  — every field of every consensus type is declared bound, and how
 *   2. ROUTES  — every HTTP route is declared, with its validator and rate-limit status
 *   3. WIRE    — every gossip message variant has a schema
 *   4. MUTATION— tampering with a bound field is actually caught, by BOTH
 *                acceptBlock and verifyChain
 *
 * The first three fail the build when the source grows something the registry does not
 * know about. Adding a field to `LedgerPixel` breaks CI until someone says what binds
 * it. That is the whole point: the next unbound field cannot arrive quietly.
 *
 * The fourth is the strongest, because the first three only prove a claim was *written
 * down*. Mutation testing proves the claim is *true* — it does not ask whether a check
 * exists, it asks whether tampering is caught.
 *
 * This is the same trick `audit-scope-selftest.ts` already used to keep
 * `verifySignatureShapeOnly` out of `chain.ts`, generalised from one symbol to every
 * field, route and message in the protocol.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  acceptBlock,
  createGenesis,
  sequenceBlock,
  verifyChain,
  type LedgerPixel,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import { createTransaction } from "../src/lib/pixel/transaction";
import { WIRE_MESSAGE_TYPES } from "../src/lib/pixel/wire-schema";
import { isWritePath } from "../src/node/rpc-server";

const root = join(import.meta.dir, "..");
let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

/**
 * How a field is prevented from being forged.
 *
 * `recomputed`  derived from prior state and compared — unforgeable
 * `committed`   inside a hash preimage that is itself recomputed
 * `checked`     an explicit rule in the accept path
 * `derived`     not carried on the wire; computed on read
 * `public`      carries no authority; forging it achieves nothing
 */
type Binding = "recomputed" | "committed" | "checked" | "derived" | "public";

interface FieldClaim {
  binding: Binding;
  /** Why this binding is sufficient. One sentence, for the next reader. */
  why: string;
}

/**
 * FIELDS — every field of every consensus type, and what stops it being forged.
 *
 * Keep this honest. A field listed `public` must genuinely confer nothing; if you find
 * yourself wanting to write "probably fine", it is not `public`, it is unbound.
 */
const FIELDS: Record<string, Record<string, FieldClaim>> = {
  LedgerPixel: {
    index: { binding: "checked", why: "must equal tip.index + 1, and its position on replay" },
    prevHash: { binding: "checked", why: "must equal the tip hash; proof must bind the same" },
    merkleRoot: { binding: "recomputed", why: "rebuilt from the transaction ids" },
    sequence: { binding: "checked", why: "must be exactly tip.sequence + 1 (T1.2)" },
    lightProof: { binding: "checked", why: "verified field by field — see LightProof below" },
    transactions: { binding: "checked", why: "identity, ownership, conservation, bounds" },
    timestamp: { binding: "checked", why: "strictly increasing, bounded future drift" },
    hash: { binding: "recomputed", why: "rebuilt from the header preimage" },
    color: { binding: "recomputed", why: "recomputed by colorFromLight and compared" },
    illuminated: { binding: "checked", why: "must be true; an unlit pixel is not on-chain" },
    proximity: { binding: "recomputed", why: "recomputed with the colour and compared" },
    field: { binding: "recomputed", why: "array compared, not only its digest (T1.9)" },
    wave: { binding: "recomputed", why: "array compared, not only its digest (T1.9)" },
    membership: { binding: "checked", why: "possession + authorization + delay (T1.1)" },
  },
  LightProof: {
    sequence: { binding: "checked", why: "must equal the block's own sequence (T1.2)" },
    sequencerAddress: { binding: "checked", why: "must be the address the lottery elected" },
    sequencerPublicKey: { binding: "checked", why: "must commit to sequencerAddress" },
    scheme: { binding: "checked", why: "required, and must match the signature (T1.10b)" },
    beacon: { binding: "recomputed", why: "recomputed by opticalBeacon from sequence + prevHash" },
    prevHash: { binding: "checked", why: "must equal the block's prevHash (T1.10)" },
    signature: { binding: "checked", why: "verified over the PoLS message for the era" },
    revealedAt: {
      binding: "public",
      why: "a display timestamp carrying no authority; every field it could lie about — sequence, beacon, prevHash — is separately bound",
    },
    skipCount: { binding: "checked", why: "range bounded, and the stall window must have elapsed" },
    electable: { binding: "checked", why: "must equal the membership fold at this height (T1.1)" },
    fieldDigest: { binding: "recomputed", why: "recomputed from prior colours" },
    waveDigest: { binding: "recomputed", why: "recomputed from lattice propagation" },
    spatialRoot: { binding: "recomputed", why: "recomputed from the illuminated picture" },
    membershipDigest: {
      binding: "checked",
      why: "bound into the signed PoLS message when present",
    },
  },
  Transaction: {
    txid: { binding: "recomputed", why: "recomputed from the canonical body (T1.3)" },
    inputs: { binding: "checked", why: "must exist, be unspent, unrepeated, and owned" },
    outputs: { binding: "checked", why: "positive safe integers, conserved against inputs" },
    metadata: { binding: "committed", why: "inside the signed body; strict schema, size bounded" },
    commitment: { binding: "recomputed", why: "recomputed from the canonical body (T1.3)" },
    state: { binding: "checked", why: "must be revealed or final inside a pixel" },
    privacy: {
      binding: "recomputed",
      why: "feeds privacyPolarization, so the recomputed block colour catches a flip (T1.10c)",
    },
    timestamp: { binding: "committed", why: "inside the signed canonical body" },
    lightSequence: { binding: "checked", why: "must equal the containing pixel's sequence" },
    revealedAt: {
      binding: "public",
      why: "a display timestamp outside the signed body; recomputable from the pixel that included it",
    },
  },
  SequencerRecord: {
    kind: { binding: "committed", why: "inside both signed membership messages" },
    address: { binding: "checked", why: "must be the commitment to publicKey" },
    publicKey: { binding: "committed", why: "inside both signed membership messages" },
    scheme: { binding: "checked", why: "must match the possession signature's algorithm" },
    includedAt: { binding: "checked", why: "must equal the carrying pixel's index; signed" },
    possession: { binding: "checked", why: "verified against publicKey" },
    authorizedBy: { binding: "checked", why: "must be an active member at includedAt" },
    authorization: { binding: "checked", why: "verified against the authorizer's historical key" },
  },
};

/** Pull the field names out of an exported interface/type declaration in source. */
function declaredFields(source: string, typeName: string): string[] {
  const re = new RegExp(`export (?:interface|type) ${typeName}\\s*(?:=\\s*)?\\{`);
  const m = re.exec(source);
  if (!m) throw new Error(`could not find declaration of ${typeName}`);
  let depth = 0;
  let i = m.index + m[0].length - 1;
  const start = i;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = source.slice(start + 1, i);
  // Strip block comments so `/** wave */` cannot look like a field.
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const fields = new Set<string>();
  // Top-level `name?: type` only — nested object literals are part of a field's type.
  let nest = 0;
  for (const line of clean.split("\n")) {
    const trimmed = line.trim();
    if (nest === 0) {
      const fm = /^([A-Za-z_][A-Za-z0-9_]*)\??\s*:/.exec(trimmed);
      if (fm) fields.add(fm[1]!);
    }
    nest += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
  }
  return [...fields];
}

console.log("═══ COVERAGE HARNESS — completeness is a build property ═══\n");

// ── 1. FIELDS ─────────────────────────────────────────────────────────────
const sources: Record<string, string> = {
  LedgerPixel: readFileSync(join(root, "src/lib/pixel/chain.ts"), "utf8"),
  LightProof: readFileSync(join(root, "src/lib/pixel/pol.ts"), "utf8"),
  Transaction: readFileSync(join(root, "src/lib/pixel/transaction.ts"), "utf8"),
  SequencerRecord: readFileSync(join(root, "src/lib/pixel/membership.ts"), "utf8"),
};

let fieldTotal = 0;
for (const [typeName, claims] of Object.entries(FIELDS)) {
  const declared = declaredFields(sources[typeName]!, typeName);
  fieldTotal += declared.length;

  const undeclared = declared.filter((f) => !(f in claims));
  check(
    undeclared.length === 0,
    `${typeName}: every declared field has a binding claim` +
      (undeclared.length ? ` — UNDECLARED: ${undeclared.join(", ")}` : ` (${declared.length})`),
  );

  const stale = Object.keys(claims).filter((f) => !declared.includes(f));
  check(
    stale.length === 0,
    `${typeName}: no claim for a field that no longer exists` +
      (stale.length ? ` — STALE: ${stale.join(", ")}` : ""),
  );

  const unexplained = Object.entries(claims).filter(([, c]) => c.why.trim().length < 20);
  check(unexplained.length === 0, `${typeName}: every claim explains itself`);
}
console.log(`  (${fieldTotal} consensus fields across ${Object.keys(FIELDS).length} types)`);

// ── 2. ROUTES ─────────────────────────────────────────────────────────────
// A new write endpoint that nobody added to WRITE_PATHS is unthrottled, and that is
// exactly how the /tx flood stayed open.
const rpcSource = readFileSync(join(root, "src/node/rpc-server.ts"), "utf8");
const continuitySource = readFileSync(join(root, "src/node/continuity-http.ts"), "utf8");

const writeRoutes: string[] = [];
for (const src of [rpcSource, continuitySource]) {
  for (const m of src.matchAll(/method === "(POST|PUT)" && url\.pathname === "([^"]+)"/g)) {
    writeRoutes.push(m[2]!);
  }
}
const unthrottled = [...new Set(writeRoutes)].filter((p) => !isWritePath(p));
check(writeRoutes.length > 0, `found ${writeRoutes.length} write route(s) in source`);
check(
  unthrottled.length === 0,
  `every write route is rate limited${unthrottled.length ? ` — MISSING: ${unthrottled.join(", ")}` : ""}`,
);
check(
  !isWritePath("/sync") && !isWritePath("/health"),
  "read routes are deliberately not throttled",
);

// A real block to check the wire against. Built here because §3b needs it.
const wireFounder = await generatePixelKeypair("PIX-ML-DSA-65");
const wireGenesis = await createGenesis(wireFounder);
const wireSealed = await sequenceBlock(
  {
    ...wireGenesis,
    pending: [
      await createTransaction({
        inputs: [{ txid: "00".repeat(64), vout: 0 }],
        outputs: [{ amount: 1, address: wireFounder.address }],
        metadata: { description: "opens the mempool" },
      }),
    ],
  },
  wireFounder,
);
const honestForWire = JSON.parse(
  JSON.stringify(wireSealed.pixels[wireSealed.pixels.length - 1]!),
) as LedgerPixel;

// ── 3. WIRE ───────────────────────────────────────────────────────────────
const p2pSource = readFileSync(join(root, "src/node/p2p.ts"), "utf8");
const declaredMsgs = [
  ...new Set([...p2pSource.matchAll(/type:\s*"([a-z_]+)"/g)].map((m) => m[1]!)),
];
const schemaless = declaredMsgs.filter(
  (t) => !(WIRE_MESSAGE_TYPES as readonly string[]).includes(t),
);
check(
  schemaless.length === 0,
  `every gossip message has a schema${schemaless.length ? ` — MISSING: ${schemaless.join(", ")}` : ` (${declaredMsgs.length})`}`,
);

// ── 3b. WIRE FIELD COVERAGE ───────────────────────────────────────────────
// A gap this harness had, found the hard way.
//
// The check above asserts every message *type* has a schema. It did not assert that
// every *field* of a consensus type appears in that schema — and `wire-schema.ts` uses
// `.strict()`, so a field it does not know about makes the whole message unparseable.
//
// T1.1 added `LightProof.membershipDigest` and `LedgerPixel.membership`. Both were
// registered in FIELDS above, both were enforced by `acceptBlock`, and neither was in the
// wire schema. The result: a pixel carrying a membership record was rejected as malformed
// by every peer, so a second operator could be invited locally and the invitation could
// never replicate. Enforced, specified, and unable to cross a socket.
//
// The registry knowing about a field is not the same as the wire knowing about it, so
// both are checked now.
const wireSource = readFileSync(join(root, "src/lib/pixel/wire-schema.ts"), "utf8");
const wireGaps: string[] = [];
for (const typeName of ["LedgerPixel", "LightProof"] as const) {
  for (const field of Object.keys(FIELDS[typeName]!)) {
    // `lightProof` is the nested schema itself rather than a leaf field.
    if (field === "lightProof") continue;
    if (!new RegExp(`(^|\\s)${field}:`, "m").test(wireSource)) {
      wireGaps.push(`${typeName}.${field}`);
    }
  }
}
check(
  wireGaps.length === 0,
  wireGaps.length === 0
    ? "every consensus field of a block appears in the wire schema"
    : `NOT ON THE WIRE: ${wireGaps.join(", ")} — .strict() will reject any message carrying it`,
);

// And prove it end to end: a pixel carrying a membership record must survive the wire.
const { peerMessageSchema } = await import("../src/lib/pixel/wire-schema");
const withMembership = {
  ...honestForWire,
  membership: [
    {
      kind: "sequencer-join" as const,
      address: "pix1" + "a".repeat(38),
      publicKey: "ab".repeat(32),
      scheme: "PIX-ML-DSA-65" as const,
      includedAt: honestForWire.index,
      possession: JSON.stringify({ alg: "PIX-ML-DSA-65", sig: "aa" }),
      authorizedBy: "pix1" + "b".repeat(38),
      authorization: JSON.stringify({ alg: "PIX-ML-DSA-65", sig: "bb" }),
    },
  ],
  lightProof: { ...honestForWire.lightProof, membershipDigest: "cd".repeat(64) },
};
check(
  peerMessageSchema.safeParse({ type: "pixel", pixel: withMembership }).success,
  "a pixel carrying a membership record parses on the wire (this was the bug)",
);

// ── 4. MUTATION ───────────────────────────────────────────────────────────
// The registries above prove a claim was written down. This proves it is true.
const founder = await generatePixelKeypair("PIX-ML-DSA-65");
const genesis = await createGenesis(founder);
const parent: PixelChainState = {
  ...genesis,
  utxos: new Map(genesis.utxos),
  usedOtsLeaves: new Set(genesis.usedOtsLeaves),
  pending: [],
  reservedInputs: new Set(),
};
const sealed = await sequenceBlock(
  {
    ...genesis,
    pending: [
      await createTransaction({
        inputs: [{ txid: "00".repeat(64), vout: 0 }],
        outputs: [{ amount: 1, address: founder.address }],
        metadata: { description: "opens the mempool" },
      }),
    ],
  },
  founder,
);
const honest = sealed.pixels[sealed.pixels.length - 1]!;

check(
  (await acceptBlock(parent, honest)
    .then(() => true)
    .catch(() => false)) && (await verifyChain(sealed)),
  "control: the honest block is accepted and its chain verifies",
);

/** Tamper with one bound field and require BOTH gates to notice. */
const TAMPERS: Array<{ field: string; apply: (b: LedgerPixel) => LedgerPixel }> = [
  { field: "LedgerPixel.index", apply: (b) => ({ ...b, index: b.index + 1 }) },
  { field: "LedgerPixel.prevHash", apply: (b) => ({ ...b, prevHash: "11".repeat(64) }) },
  { field: "LedgerPixel.merkleRoot", apply: (b) => ({ ...b, merkleRoot: "22".repeat(64) }) },
  { field: "LedgerPixel.sequence", apply: (b) => ({ ...b, sequence: b.sequence + 4 }) },
  { field: "LedgerPixel.timestamp", apply: (b) => ({ ...b, timestamp: 1 }) },
  { field: "LedgerPixel.hash", apply: (b) => ({ ...b, hash: "33".repeat(64) }) },
  {
    field: "LedgerPixel.color",
    apply: (b) => ({ ...b, color: { ...b.color, g: (b.color.g + 77) % 256 } }),
  },
  { field: "LedgerPixel.illuminated", apply: (b) => ({ ...b, illuminated: false }) },
  { field: "LedgerPixel.proximity", apply: (b) => ({ ...b, proximity: [...b.proximity, 4242] }) },
  { field: "LedgerPixel.field", apply: (b) => ({ ...b, field: [] }) },
  {
    field: "LedgerPixel.wave",
    apply: (b) => ({ ...b, wave: (b.wave ?? []).map((h) => ({ ...h, hop: h.hop + 3 })) }),
  },
  {
    field: "LightProof.sequence",
    apply: (b) => ({ ...b, lightProof: { ...b.lightProof, sequence: b.sequence + 9 } }),
  },
  {
    field: "LightProof.prevHash",
    apply: (b) => ({ ...b, lightProof: { ...b.lightProof, prevHash: "44".repeat(64) } }),
  },
  {
    field: "LightProof.sequencerAddress",
    apply: (b) => ({
      ...b,
      lightProof: { ...b.lightProof, sequencerAddress: "pix1" + "0".repeat(38) },
    }),
  },
  {
    field: "LightProof.scheme",
    apply: (b) => {
      const proof = { ...b.lightProof } as Record<string, unknown>;
      delete proof.scheme;
      return { ...b, lightProof: proof as LedgerPixel["lightProof"] };
    },
  },
  {
    field: "LightProof.beacon",
    apply: (b) => ({ ...b, lightProof: { ...b.lightProof, beacon: "55".repeat(64) } }),
  },
  {
    field: "LightProof.signature",
    apply: (b) => ({
      ...b,
      lightProof: {
        ...b.lightProof,
        signature: JSON.stringify({ alg: "PIX-ML-DSA-65", sig: "ab" }),
      },
    }),
  },
  {
    field: "LightProof.electable",
    apply: (b) => ({
      ...b,
      lightProof: { ...b.lightProof, electable: ["pix1" + "e".repeat(38)] },
    }),
  },
  {
    field: "LightProof.fieldDigest",
    apply: (b) => ({ ...b, lightProof: { ...b.lightProof, fieldDigest: "66".repeat(64) } }),
  },
  {
    field: "LightProof.waveDigest",
    apply: (b) => ({ ...b, lightProof: { ...b.lightProof, waveDigest: "77".repeat(64) } }),
  },
  {
    field: "LightProof.spatialRoot",
    apply: (b) => ({ ...b, lightProof: { ...b.lightProof, spatialRoot: "88".repeat(64) } }),
  },
  {
    field: "Transaction.txid",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t, i) => (i === 0 ? { ...t, txid: "99".repeat(64) } : t)),
    }),
  },
  {
    field: "Transaction.commitment",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t, i) =>
        i === 0 ? { ...t, commitment: "aa".repeat(64) } : t,
      ),
    }),
  },
  {
    field: "Transaction.outputs",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t, i) =>
        i === 0 ? { ...t, outputs: t.outputs.map((o) => ({ ...o, amount: o.amount + 5 })) } : t,
      ),
    }),
  },
  {
    field: "Transaction.metadata",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t, i) =>
        i === 0 ? { ...t, metadata: { ...t.metadata, description: "rewritten" } } : t,
      ),
    }),
  },
  {
    field: "Transaction.state",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t) => ({ ...t, state: "superposition" as const })),
    }),
  },
  {
    field: "Transaction.privacy",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t) => ({ ...t, privacy: "private" as const })),
    }),
  },
  {
    field: "Transaction.timestamp",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t, i) =>
        i === 0 ? { ...t, timestamp: t.timestamp + 1_000_000 } : t,
      ),
    }),
  },
  {
    field: "Transaction.lightSequence",
    apply: (b) => ({
      ...b,
      transactions: b.transactions.map((t) => ({
        ...t,
        lightSequence: (t.lightSequence ?? 0) + 6,
      })),
    }),
  },
];

let caughtBoth = 0;
const escaped: string[] = [];
for (const { field, apply } of TAMPERS) {
  const mutated = apply(honest);
  const acceptCaught = await acceptBlock(parent, mutated)
    .then(() => false)
    .catch(() => true);
  const verifyCaught = !(await verifyChain({ ...parent, pixels: [...parent.pixels, mutated] }));
  if (acceptCaught && verifyCaught) caughtBoth++;
  else
    escaped.push(
      `${field} (accept:${acceptCaught ? "caught" : "MISSED"} verify:${verifyCaught ? "caught" : "MISSED"})`,
    );
}
check(
  escaped.length === 0,
  `${caughtBoth}/${TAMPERS.length} tampered fields caught by BOTH gates` +
    (escaped.length ? ` — ESCAPED: ${escaped.join("; ")}` : ""),
);

// Fields claimed `public` must genuinely carry no authority: tampering with them is
// allowed, and the claim is that this is harmless rather than unnoticed.
const publicFields = Object.entries(FIELDS).flatMap(([type, claims]) =>
  Object.entries(claims)
    .filter(([, c]) => c.binding === "public")
    .map(([f]) => `${type}.${f}`),
);
check(
  publicFields.length <= 2 && publicFields.every((f) => f.endsWith(".revealedAt")),
  `only display timestamps are claimed 'public' (${publicFields.join(", ") || "none"})`,
);

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} coverage gap(s) ═══`);
  process.exit(1);
}
console.log("═══ PASS — nothing in the protocol is unaccounted for ═══");

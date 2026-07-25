/**
 * Lumen type surface — light kinds, not memory layouts.
 *
 * Annotations are optional (progressive). When present, `checkLumen` refuses
 * dark mismatches before the host runs.
 */

/** First-class light kinds (match arms + annotations share this set). */
export const LIGHT_KINDS = [
  "number",
  "string",
  "bool",
  "address",
  "ghost",
  "picture",
  "settled",
  "tip",
  "proof",
  "unit",
  "any",
] as const;

export type LightKind = (typeof LIGHT_KINDS)[number];

export function isLightKind(name: string): name is LightKind {
  return (LIGHT_KINDS as readonly string[]).includes(name);
}

export type TypedParam = {
  name: string;
  /** Absent = untyped (legacy / progressive). */
  type?: LightKind;
};

/** Builtin signatures for the checker (arity + light kinds). */
export const BUILTIN_SIGS: Record<
  string,
  { params: LightKind[]; returns: LightKind; variadic?: boolean }
> = {
  commit: { params: ["string", "string", "number", "string"], returns: "ghost" },
  balance: { params: ["string"], returns: "number" },
  tip: { params: [], returns: "tip" },
  kindle: { params: ["string", "string", "number", "string"], returns: "settled" },
  shine_in: { params: ["string", "number"], returns: "settled" },
  digest: { params: ["string", "any"], returns: "string", variadic: true },
  attest: { params: ["any"], returns: "proof", variadic: true },
  project: { params: ["string"], returns: "picture" },
  recover: { params: ["picture"], returns: "string" },
  maze: { params: ["string"], returns: "picture" },
  kind_of: { params: ["any"], returns: "string" },
};

/** Field projections known to the checker. */
export const FIELD_TYPES: Record<string, Record<string, LightKind>> = {
  tip: {
    index: "number",
    tipHash: "string",
    waveDigest: "string",
    spatialRoot: "string",
    kind: "string",
  },
  proof: {
    light: "string",
    subject: "string",
    label: "string",
    at: "number",
    kind: "string",
  },
  settled: {
    txid: "string",
    summary: "string",
    kind: "string",
  },
  ghost: {
    id: "string",
    kind: "string",
    light: "string",
    commitment: "string",
    amount: "number",
    memo: "string",
    from: "string",
    to: "string",
  },
  picture: {
    checksum: "string",
    payloadHex: "string",
    kind: "string",
  },
};

export function kindsCompatible(expected: LightKind, actual: LightKind): boolean {
  if (expected === "any" || actual === "any") return true;
  if (expected === actual) return true;
  // address is a string face in ceremonies
  if (expected === "string" && actual === "address") return true;
  if (expected === "address" && actual === "string") return true;
  return false;
}

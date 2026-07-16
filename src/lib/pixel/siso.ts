/**
 * SISO — Shine In / Shine Out framework
 *
 * ICP-style platforms often force a *parallel build*: rewrite the calculator
 * for their VM to have a calculator “on” them. Two Facebooks.
 *
 * Pixel Ledger rejects that. Build anywhere — AWS, a laptop, Rust, Python,
 * JS, Go, a spreadsheet macro. When the artifact **comes into the light**
 * (registers a continuity record + optional payload mirrors), Pixel accepts
 * it. If AWS dies, peers can still serve / verify / restart from what was
 * shone in. Belief in Pixel + SISO = continuity, not a second rewrite.
 *
 *   Shine In   — foreign world → Pixel light (register, mirror, attest)
 *   Shine Out  — Pixel light → foreign world (proofs, unlocks, wake mirrors)
 */

import { sha512Hex, type Hex } from "./crypto";

export type ArtifactKind =
  | "source_tarball"
  | "container_image"
  | "wasm"
  | "static_site"
  | "api_openapi"
  | "agent_mcp"
  | "binary"
  | "other";

export type HostOrigin =
  | "aws"
  | "gcp"
  | "azure"
  | "cloudflare"
  | "vercel"
  | "home"
  | "colo"
  | "unknown";

/** Any stack’s fingerprint — language-agnostic. */
export interface LightArtifact {
  /** Human name */
  name: string;
  kind: ArtifactKind;
  /** Content-addressed digest of the deployable (sha512 hex) */
  digest: Hex;
  /** Freeform: "typescript", "python", "rust", "java", … — never a allowlist gate */
  languages: string[];
  /** Where it runs today (may fail); Pixel does not require it stays there */
  originHost: HostOrigin;
  originUrl?: string;
  /** Optional mirror pointers peers can fetch when origin is dark */
  mirrors?: string[];
  /** MCP / agent tool schema hash if kind === agent_mcp */
  mcpSchemaDigest?: Hex;
}

export type ContinuityState = "outside" | "in_superposition" | "in_the_light" | "origin_dark";

export interface ContinuityRecord {
  artifact: LightArtifact;
  state: ContinuityState;
  /** Commitment while waiting for illumination */
  commitment?: Hex;
  /** Pixel index that accepted it into the light (after PoLS) */
  illuminatedAtPixel?: number;
  registeredAt: number;
  lastSeenOriginAt?: number;
  note?: string;
}

export async function digestBytes(data: Uint8Array | string): Promise<Hex> {
  return sha512Hex(typeof data === "string" ? data : data);
}

/** Bring any artifact to the door of the light — not yet settled. */
export async function comeTowardLight(
  artifact: LightArtifact,
): Promise<ContinuityRecord> {
  const commitment = await sha512Hex(
    JSON.stringify({
      digest: artifact.digest,
      name: artifact.name,
      kind: artifact.kind,
      languages: artifact.languages,
    }),
  );
  return {
    artifact,
    state: "in_superposition",
    commitment,
    registeredAt: Date.now(),
    lastSeenOriginAt: Date.now(),
    note: "Awaiting illumination — any language welcome; no parallel rewrite required",
  };
}

/** PoLS / operator accepts the record — it is in the light. */
export function acceptIntoLight(
  record: ContinuityRecord,
  pixelIndex: number,
): ContinuityRecord {
  if (record.state !== "in_superposition" && record.state !== "outside") {
    return { ...record, illuminatedAtPixel: pixelIndex, state: "in_the_light" };
  }
  return {
    ...record,
    state: "in_the_light",
    illuminatedAtPixel: pixelIndex,
    note: "In the light — usable via Pixel continuity even if origin host fails",
  };
}

/** Origin (e.g. AWS) is unreachable; continuity still holds if mirrors/peers exist. */
export function markOriginDark(record: ContinuityRecord): ContinuityRecord {
  if (record.state !== "in_the_light" && record.state !== "origin_dark") {
    throw new Error("Cannot mark origin dark before the artifact is in the light");
  }
  return {
    ...record,
    state: "origin_dark",
    note: "Origin dark — serve from mirrors / peer shine; no second Facebook required",
  };
}

export function canServeWithoutOrigin(record: ContinuityRecord): boolean {
  return (
    (record.state === "in_the_light" || record.state === "origin_dark") &&
    Boolean(record.artifact.mirrors?.length || record.illuminatedAtPixel !== undefined)
  );
}

/** Shine Out intent: ask foreign networks to recognize Pixel continuity. */
export interface SisoShineOut {
  continuityCommitment: Hex;
  artifactDigest: Hex;
  toChain: string;
  purpose: "attest_availability" | "wake_mirror" | "unlock_value" | "mcp_advertise";
}

/** Shine In intent: foreign proof or blob enters Pixel. */
export interface SisoShineIn {
  foreignChain: string;
  foreignRef: string;
  artifactDigest: Hex;
  purpose: "register" | "mirror_push" | "mcp_register" | "lock_value";
}

export function sisoThesis(): {
  problem: string;
  rule: string;
  vsIcp: string;
  awsFailure: string;
} {
  return {
    problem:
      "Platforms that require rewriting every app for their VM create parallel builds — two calculators, two Facebooks.",
    rule:
      "Build in any language, anywhere. Come into the light once; Pixel accepts the artifact by digest and continuity, not by rewrite.",
    vsIcp:
      "ICP-style: build on ICP to run on ICP. Pixel: build on AWS/Rust/Python/… and shine in — no dual product.",
    awsFailure:
      "If AWS goes down and the service believed in Pixel (mirrored + illuminated), peers keep it usable via SISO continuity.",
  };
}

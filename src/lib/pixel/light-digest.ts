/**
 * Light Digest — one door for every labeled hash.
 *
 * Complex hash surfaces (tx commitment, txid, optical checksum, address,
 * OTS merkle, SISO artifact, PoLS beacon) collapse to:
 *
 *   lightDigest(kind, …parts) → Hex
 *
 * L0 claim: where this digest can be recomputed, verification survives.
 * An EMP in one place does not erase light that still exists in another.
 * Lumen authors call `digest` / `attest` — never sha512 domain strings.
 */

import { sha512Hex, type Hex } from "./crypto";

/** Stable labels — domain separators stay byte-compatible with existing chains. */
export const LIGHT_KINDS = [
  "existence",
  "superposition",
  "txid",
  "address",
  "optical",
  "beacon",
  "artifact",
  "ots-merkle",
  "leaf",
  "creation",
] as const;

export type LightKind = (typeof LIGHT_KINDS)[number] | (string & {});

export type LightPart = string | Uint8Array | number | boolean;

function partToString(p: LightPart): string {
  if (typeof p === "string") return p;
  if (typeof p === "number" || typeof p === "boolean") return String(p);
  // compact hex for bytes — callers that need raw bytes use sha512Hex directly
  return [...p].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Single labeled digest. Preserves historical separators for migrated kinds:
 *   superposition|body, txid|commitment|body, pix-addr|pk, light-beacon|…
 */
export async function lightDigest(kind: LightKind, ...parts: LightPart[]): Promise<Hex> {
  const joined = parts.map(partToString).join("|");

  switch (kind) {
    case "superposition":
      return sha512Hex(`superposition|${parts.map(partToString).join("")}`);
    case "txid":
      return sha512Hex(`txid|${joined}`);
    case "address":
      return sha512Hex(`pix-addr|${joined}`);
    case "beacon":
      return sha512Hex(`light-beacon|${joined}`);
    case "ots-merkle":
      return sha512Hex(`ots-merkle|${joined}`);
    case "optical":
      // Optical patterns historically hash raw payload bytes — if a single
      // Uint8Array is passed, keep that path; otherwise label the material.
      if (parts.length === 1 && parts[0] instanceof Uint8Array) {
        return sha512Hex(parts[0]);
      }
      return sha512Hex(`optical|${joined}`);
    case "existence":
      return sha512Hex(`existence|${joined}`);
    case "creation":
      return sha512Hex(`creation|${joined}`);
    case "artifact":
      return sha512Hex(`artifact|${joined}`);
    case "leaf":
      return sha512Hex(`leaf|${joined}`);
    default:
      return sha512Hex(`${kind}|${joined}`);
  }
}

/** Normalize any string/hex into a 32-byte optical payload (hides pad/slice dance). */
export function asOpticalPayload(secret: string): Uint8Array {
  const hex = secret.replace(/^0x/i, "").padEnd(64, "0").slice(0, 64);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2) || "00", 16);
  }
  return out;
}

export interface ExistenceProof {
  /** Recomputable anywhere lightDigest runs — the surviving “dot” of light. */
  light: Hex;
  kind: LightKind;
  /** Human / agent subject that was attested */
  subject: string;
  at: number;
}

/** Attest that something existed under light — store of creation, not only wealth. */
export async function attestExistence(
  subject: string,
  extra: LightPart[] = [],
): Promise<ExistenceProof> {
  const at = Date.now();
  const light = await lightDigest("existence", subject, at, ...extra);
  return { light, kind: "existence", subject, at };
}

/**
 * The signature rules that were in force before PIX-10/PIX-16 — verification only.
 *
 * ## Why this file exists
 *
 * Commit `c8d5d54` changed three things at once, and every one of them was right:
 *
 *   1. ML-DSA domain separation moved out of the message and into the FIPS-204
 *      native `ctx` parameter, so an attacker cannot absorb a delimiter to make a
 *      message collide across protocol contexts.
 *   2. The OTS signed-digest width went 128 -> 256 bits, because a colliding
 *      message pair had cost a 2^64 birthday search rather than the 2^128 the
 *      scheme name asserts.
 *   3. OTS payloads gained a length-prefixed domain tag, and leaf commitment
 *      halves widened from 16 to 64 hex characters, closing a 64-bit
 *      second-preimage target under an already-revealed leaf.
 *
 * What none of them came with was a migration. Thirteen light proofs and twelve
 * spend transactions had already been signed under the old rules, and after that
 * commit no code in the repository could verify them. It went unnoticed for weeks
 * because nothing ever re-verifies stored history: `deserializeChain` does not call
 * `verifyChain`, and `acceptBlock` only ever sees blocks that do not exist yet. A
 * verifier that is never pointed at the past cannot report that the past has
 * stopped verifying.
 *
 * The bytes were never lost or altered. What was lost was the ability of a stranger
 * to check them, which is the one property this whole project rests on. So this
 * module restores it, the way a chain is supposed to: by stating the rule that
 * applied at each height and keeping both.
 *
 * ## What this file is not
 *
 * There is **no signing function here, and there must never be one.** The old
 * constructions are weaker; that is why they were replaced. They are readable
 * history, not an available option. `sig-era.ts` decides where they may be read,
 * and the answer is bounded, height-gated, and confined to one network.
 *
 * Nothing here is reachable from a produce path. `scripts/sig-era-selftest.ts`
 * asserts this module exports no `sign*` symbol.
 */

import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { canonicalizeHex, hexToBytes, sha512Sync, sha512SyncHex, type Hex } from "./crypto";
import type { SchemeId } from "./scheme";

/** Leaves in an OTS Merkle window. Unchanged across the era boundary. */
const LEGACY_OTS_LEAF_COUNT = 32;

/** Signed digest width before PIX-10 widened it to 256. */
const LEGACY_MSG_BITS = 128;

/** Hex characters per Lamport commitment half before PIX-10 widened it to 64. */
const LEGACY_HALF_HEX = 16;

/** Bytes of the Lamport preimage revealed per signed bit. Unchanged. */
const LEGACY_CHUNK_HEX = 64;

/**
 * Pre-PIX-16 ML-DSA message: domain separation concatenated into the message,
 * with no FIPS-204 context.
 */
function legacyMldsaMessage(message: string, scheme: SchemeId): Uint8Array {
  return new TextEncoder().encode(`pix-sig|${scheme}|${message}`);
}

/**
 * The legacy OTS envelope, parsed on its own terms.
 *
 * `validators.ts` deliberately refuses this shape — `otsSignatureSchema` requires
 * 256 revealed entries and 64-character complements, so a legacy envelope fails to
 * parse there and cannot leak into a current-era path by accident. That refusal is
 * a feature, which is why this module carries its own narrow parser instead of
 * loosening the real one.
 */
interface LegacyOtsSignature {
  alg: "PIX-HASH-OTS-128";
  leafIndex: number;
  leafPublicKey: string;
  authPath: string[];
  revealed: string[];
  complements: string[];
  /** Ancestral weaker field. Its presence without `complements` was forgeable. */
  pubCommit?: string;
}

const HEX = /^[0-9a-fA-F]+$/;

function parseLegacyOts(signatureJson: string): LegacyOtsSignature | null {
  let raw: unknown;
  try {
    raw = JSON.parse(signatureJson);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (s.alg !== "PIX-HASH-OTS-128") return null;
  if (typeof s.leafIndex !== "number" || !Number.isInteger(s.leafIndex)) return null;
  if (s.leafIndex < 0 || s.leafIndex >= LEGACY_OTS_LEAF_COUNT) return null;
  if (typeof s.leafPublicKey !== "string" || !HEX.test(s.leafPublicKey)) return null;

  const authPath = s.authPath;
  if (!Array.isArray(authPath) || authPath.length !== Math.log2(LEGACY_OTS_LEAF_COUNT)) return null;
  if (!authPath.every((h) => typeof h === "string" && HEX.test(h))) return null;

  const revealed = s.revealed;
  const complements = s.complements;
  if (!Array.isArray(revealed) || revealed.length !== LEGACY_MSG_BITS) return null;
  if (!Array.isArray(complements) || complements.length !== LEGACY_MSG_BITS) return null;
  if (
    !revealed.every((h) => typeof h === "string" && h.length === LEGACY_CHUNK_HEX && HEX.test(h))
  ) {
    return null;
  }
  if (
    !complements.every((h) => typeof h === "string" && h.length === LEGACY_HALF_HEX && HEX.test(h))
  ) {
    return null;
  }
  return {
    alg: "PIX-HASH-OTS-128",
    leafIndex: s.leafIndex,
    leafPublicKey: s.leafPublicKey,
    authPath: authPath as string[],
    revealed: revealed as string[],
    complements: complements as string[],
    pubCommit: typeof s.pubCommit === "string" ? s.pubCommit : undefined,
  };
}

/** Climb the OTS Merkle window. Domain tag unchanged across the era boundary. */
function legacyClimbMerkle(leaf: string, index: number, authPath: string[]): string {
  let hash = leaf;
  let i = index;
  for (const sibling of authPath) {
    hash =
      i % 2 === 0
        ? sha512SyncHex(`ots-merkle|${hash}|${sibling}`)
        : sha512SyncHex(`ots-merkle|${sibling}|${hash}`);
    i = Math.floor(i / 2);
  }
  return hash;
}

/** Pre-PIX-10/16 hash-OTS verification: 128 signed bits, bare message, 16-char halves. */
function verifyLegacyOts(message: string, signatureJson: string, publicKey: Hex): boolean {
  try {
    const sig = parseLegacyOts(signatureJson);
    if (!sig) return false;
    // The forgeable ancestral format carried only pubCommit and no complements.
    // parseLegacyOts already requires complements, so this is belt and braces.
    if (sig.pubCommit && sig.complements.length === 0) return false;

    // Pre-PIX-16: the digest is taken over the bare message, with no domain tag
    // and no length prefix.
    const digest = sha512Sync(message);
    const bits = digest.slice(0, LEGACY_MSG_BITS / 8);
    const publicParts: string[] = [];

    for (let i = 0; i < LEGACY_MSG_BITS; i++) {
      const byte = bits[Math.floor(i / 8)]!;
      const bit = (byte >> (7 - (i % 8))) & 1;
      const revealedHash = sha512SyncHex(hexToBytes(sig.revealed[i]!)).slice(0, LEGACY_HALF_HEX);
      const complement = sig.complements[i]!;
      publicParts.push(bit === 0 ? `${revealedHash}${complement}` : `${complement}${revealedHash}`);
    }

    if (sha512SyncHex(publicParts.join("|")) !== sig.leafPublicKey) return false;
    return (
      legacyClimbMerkle(sig.leafPublicKey, sig.leafIndex, sig.authPath) ===
      canonicalizeHex(publicKey)
    );
  } catch {
    return false;
  }
}

/** Pre-PIX-16 ML-DSA verification: prefixed message, no FIPS-204 context. */
function verifyLegacyMldsa(message: string, signatureJson: string, publicKey: Hex): boolean {
  try {
    const parsed = JSON.parse(signatureJson) as { alg?: unknown; sig?: unknown };
    if (parsed.alg !== "PIX-ML-DSA-65") return false;
    if (typeof parsed.sig !== "string" || !HEX.test(parsed.sig)) return false;
    return ml_dsa65.verify(
      hexToBytes(parsed.sig),
      legacyMldsaMessage(message, "PIX-ML-DSA-65"),
      hexToBytes(publicKey),
    );
  } catch {
    return false;
  }
}

/**
 * Verify a signature under the rules that applied before PIX-10/PIX-16.
 *
 * Callers must not reach this directly — go through `verifySignatureAtHeight` in
 * `sig-era.ts`, which is what bounds the era to the heights that legitimately
 * predate the change. Exported only so that module and its selftest can use it.
 */
export async function verifyPixelLegacyPreCtx(
  message: string,
  signatureJson: string,
  publicKey: Hex,
): Promise<boolean> {
  let alg: unknown;
  try {
    alg = (JSON.parse(signatureJson) as { alg?: unknown }).alg;
  } catch {
    return false;
  }
  if (alg === "PIX-ML-DSA-65") return verifyLegacyMldsa(message, signatureJson, publicKey);
  if (alg === "PIX-HASH-OTS-128") return verifyLegacyOts(message, signatureJson, publicKey);
  return false;
}

/**
 * Read the scheme from a legacy envelope.
 *
 * The current `schemeFromSignature` validates the *whole* envelope against the
 * strict zod schema before reporting `alg`, so a pre-PIX-10 OTS envelope — 128
 * revealed entries and 16-character complements rather than 256 and 64 — returns
 * `null` there. Authorization needs the scheme to derive the address a key commits
 * to, so without this the legacy era would verify a signature and then fail to work
 * out whose it was.
 *
 * Still strict, just strict about a different shape: the envelope must parse as one
 * of the two eras' forms, so this never degrades into "trust the `alg` field".
 */
export function legacySchemeOf(signatureJson: string): SchemeId | null {
  let alg: unknown;
  try {
    alg = (JSON.parse(signatureJson) as { alg?: unknown }).alg;
  } catch {
    return null;
  }
  if (alg === "PIX-ML-DSA-65") {
    const parsed = JSON.parse(signatureJson) as { sig?: unknown };
    return typeof parsed.sig === "string" && HEX.test(parsed.sig) ? "PIX-ML-DSA-65" : null;
  }
  if (alg === "PIX-HASH-OTS-128") {
    return parseLegacyOts(signatureJson) ? "PIX-HASH-OTS-128" : null;
  }
  return null;
}

/** What changed, for docs and the truth badges. Prose lives next to the code it describes. */
export function legacySignatureEraThesis(): {
  boundaryCommit: string;
  changes: string[];
  whyKept: string;
  whyVerifyOnly: string;
} {
  return {
    boundaryCommit: "c8d5d54",
    changes: [
      "ML-DSA domain separation moved from a message prefix into the FIPS-204 ctx parameter",
      "OTS signed-digest width 128 -> 256 bits (PIX-10)",
      "OTS payloads gained a length-prefixed domain tag; commitment halves 16 -> 64 hex chars",
    ],
    whyKept:
      "Signatures already on the crowned chain were made under the old rules. A chain that " +
      "cannot verify its own history is not verifiable by anyone, which is the property the " +
      "project rests on. Keeping the old rule at the heights where it applied is how a ledger " +
      "stays checkable across a change to its own cryptography.",
    whyVerifyOnly:
      "The old constructions are weaker, which is why they were replaced. They are readable " +
      "history, never an available option: there is no signing path here, and the era is " +
      "height-gated to one network so it cannot spread.",
  };
}

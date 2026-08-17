/**
 * Which signature rules applied at which height.
 *
 * A ledger that changes its own cryptography has two honest options: fork, or say
 * exactly where the old rule stopped and the new one started. Pixel did neither —
 * PIX-10/PIX-16 replaced three signature constructions in one commit and left the
 * first thirteen pixels unverifiable by every later version of the code (see
 * `legacy-sig.ts` for what changed, and `docs/SPEC.md` for the normative text).
 *
 * This module is the second option, applied after the fact. It is deliberately
 * small and deliberately boring, because an activation rule that is clever is an
 * activation rule nobody can audit.
 *
 * ## Three properties this file must keep
 *
 * **Deterministic, never "try both".** At any given height exactly one
 * construction is acceptable. A verifier that falls back to the weaker rule when
 * the stronger one fails is a downgrade oracle: an attacker would simply present
 * legacy-form signatures forever. So the era is selected from the height, and the
 * other era is not consulted.
 *
 * **Bounded above.** The legacy era is closed. It covers heights strictly below
 * `LEGACY_SIG_ERA_END_HEIGHT` and cannot grow, because the blocks it covers are
 * already hash-committed and finite. New blocks are always current-era.
 *
 * **Confined to one network.** Only the crowned Earth has this history. A lab
 * chain forged this afternoon has no legacy era and must never acquire one, or the
 * weaker rule becomes reachable on a chain an attacker controls.
 */

import { CROWNED_NETWORK_ID } from "./crowned-genesis";
import type { Hex } from "./crypto";
import { legacySchemeOf, verifyPixelLegacyPreCtx } from "./legacy-sig";
import { verifyPixel } from "./scheme";
import { CURRENT_SIGNATURE_POLICY, type SignaturePolicy } from "./transaction";

/**
 * First height on the crowned chain that requires the post-PIX-16 constructions.
 *
 * Measured, not chosen. Checking out `c08da2e` — the commit deployed when pixel 12
 * was produced — and verifying all 47 pixels shows that code accepts exactly 0..12
 * and rejects exactly 13..46, while current code does the precise opposite. The
 * boundary is therefore unambiguous, and `scripts/sig-era-selftest.ts` re-derives
 * it from the fixture rather than trusting this constant.
 */
export const LEGACY_SIG_ERA_END_HEIGHT = 13;

export type SigEra = "legacy-pre-ctx" | "current";

/**
 * Which rules apply to signatures inside the pixel at `height` on `networkId`.
 *
 * `height` is the pixel index the signature is committed under — for a PoLS proof
 * that is the block's own index, and for a transaction input it is the index of
 * the block that included it. A transaction has no era of its own; it inherits the
 * era of the pixel that recorded it, which is what makes the answer a function of
 * history rather than of when someone happens to ask.
 */
export function sigEraFor(params: { networkId: number; height: number }): SigEra {
  if (params.networkId !== CROWNED_NETWORK_ID) return "current";
  if (!Number.isInteger(params.height) || params.height < 0) return "current";
  return params.height < LEGACY_SIG_ERA_END_HEIGHT ? "legacy-pre-ctx" : "current";
}

/** True when this height predates the PIX-10/PIX-16 constructions. */
export function isLegacySigHeight(params: { networkId: number; height: number }): boolean {
  return sigEraFor(params) === "legacy-pre-ctx";
}

/**
 * Verify a signature under the rules in force at `height` — and only those.
 *
 * Signature-shape verification only. Whether the key is *allowed* to sign the thing
 * it signed stays where it was: `verifyTransactionSignaturesForOwners` binds key to
 * UTXO owner, and `acceptBlock` binds the proof to the elected sequencer. This
 * function answers "was this signed", never "was this authorized".
 */
export async function verifySignatureAtHeight(params: {
  message: string;
  signatureJson: string;
  publicKey: Hex;
  networkId: number;
  height: number;
}): Promise<boolean> {
  const era = sigEraFor({ networkId: params.networkId, height: params.height });
  if (era === "legacy-pre-ctx") {
    return verifyPixelLegacyPreCtx(params.message, params.signatureJson, params.publicKey);
  }
  return verifyPixel(params.message, params.signatureJson, params.publicKey);
}

/** The pre-PIX-16 rules as one unit — verification and scheme reading together. */
const LEGACY_SIGNATURE_POLICY: SignaturePolicy = {
  verify: verifyPixelLegacyPreCtx,
  schemeOf: legacySchemeOf,
};

/**
 * The signature policy that applies at `height` — verification *and* scheme reading.
 *
 * Both must come from the same era. Swapping only the verifier still rejected every
 * legacy OTS spend, because the strict scheme reader could not parse a 128-bit
 * envelope and authorization had no scheme to derive an address from. Returning them
 * as a pair is what makes that mistake unavailable.
 */
export function signaturePolicyAtHeight(params: {
  networkId: number;
  height: number;
}): SignaturePolicy {
  return sigEraFor(params) === "legacy-pre-ctx"
    ? LEGACY_SIGNATURE_POLICY
    : CURRENT_SIGNATURE_POLICY;
}

export function sigEraThesis(): {
  boundary: number;
  network: number;
  rule: string;
  refusals: string[];
} {
  return {
    boundary: LEGACY_SIG_ERA_END_HEIGHT,
    network: CROWNED_NETWORK_ID,
    rule:
      `On network ${CROWNED_NETWORK_ID}, pixels below #${LEGACY_SIG_ERA_END_HEIGHT} verify under ` +
      "the pre-PIX-16 constructions and pixels at or above it verify under the current ones. " +
      "Exactly one era applies at any height.",
    refusals: [
      "Never falls back between eras — a fallback is a downgrade oracle",
      "Never applies on any network but the crowned Earth",
      "Never signs under the legacy rules; verification only",
      "Never grows: the legacy era is closed and its blocks are already hash-committed",
    ],
  };
}

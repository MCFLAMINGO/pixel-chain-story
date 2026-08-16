#!/usr/bin/env bun
/**
 * The legacy signature era must be a rule, not a loophole.
 *
 * Keeping an older, weaker signature construction readable is the only way a chain
 * survives changing its own cryptography. It is also exactly how a chain gets a
 * downgrade oracle: if a verifier ever tries the weak rule when the strong one
 * fails, an attacker simply presents weak-form signatures forever and the upgrade
 * never happened.
 *
 * So this file asserts the four properties that make the era safe rather than
 * convenient:
 *
 *   1. Exactly one era applies at any height — never a fallback between them.
 *   2. The era is closed above. Heights at or past the boundary refuse legacy form.
 *   3. The era exists on the crowned network only. A lab chain has no legacy era
 *      and must never grow one, or the weak rule becomes reachable on a chain an
 *      attacker owns outright.
 *   4. Nothing can *sign* under the old rules. They are readable history, not an
 *      available option.
 *
 * The boundary height is re-derived from real history here rather than trusted from
 * the constant, so the constant cannot drift away from the chain it describes.
 */

import {
  LEGACY_SIG_ERA_END_HEIGHT,
  sigEraFor,
  signaturePolicyAtHeight,
  verifySignatureAtHeight,
} from "../src/lib/pixel/sig-era";
import * as legacySig from "../src/lib/pixel/legacy-sig";
import { verifyPixelLegacyPreCtx } from "../src/lib/pixel/legacy-sig";
import { CROWNED_NETWORK_ID } from "../src/lib/pixel/crowned-genesis";
import { PIXEL_LAB_NETWORK_ID } from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import { signPixel, verifyPixel } from "../src/lib/pixel/scheme";
import { canonicalTxBody, type Transaction } from "../src/lib/pixel/transaction";
import { verifyLightProof } from "../src/lib/pixel/pol";
import type { LedgerPixel } from "../src/lib/pixel/chain";

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

console.log("═══ SIGNATURE ERA — bounded, one-way, crowned-only ═══\n");

// ── 1. the boundary is what history says it is, not what the constant claims ──
const fx = JSON.parse(
  await Bun.file(new URL("../fixtures/crowned-47.json", import.meta.url)).text(),
) as { networkId: number; pixels: LedgerPixel[] };

const legacyOnly: number[] = [];
const currentOnly: number[] = [];
const neither: number[] = [];
for (const px of fx.pixels) {
  const underLegacy = await verifyLightProof(
    px.lightProof,
    px.lightProof.sequencerAddress,
    verifyPixelLegacyPreCtx,
  );
  const underCurrent = await verifyLightProof(
    px.lightProof,
    px.lightProof.sequencerAddress,
    verifyPixel,
  );
  if (underLegacy && !underCurrent) legacyOnly.push(px.index);
  else if (underCurrent && !underLegacy) currentOnly.push(px.index);
  else neither.push(px.index);
}
check(neither.length === 0, "every real pixel verifies under exactly one era, never both/neither");
const derivedBoundary = currentOnly.length > 0 ? Math.min(...currentOnly) : -1;
check(
  derivedBoundary === LEGACY_SIG_ERA_END_HEIGHT,
  `boundary derived from history is #${derivedBoundary}, and the constant agrees`,
);
check(
  legacyOnly.length === LEGACY_SIG_ERA_END_HEIGHT &&
    Math.max(...legacyOnly) === LEGACY_SIG_ERA_END_HEIGHT - 1,
  `pixels 0..${LEGACY_SIG_ERA_END_HEIGHT - 1} are legacy-only (${legacyOnly.length} of them)`,
);

// ── 2. era selection is total, deterministic and closed above ────────────────
check(
  sigEraFor({ networkId: CROWNED_NETWORK_ID, height: 0 }) === "legacy-pre-ctx",
  "genesis is legacy era",
);
check(
  sigEraFor({ networkId: CROWNED_NETWORK_ID, height: LEGACY_SIG_ERA_END_HEIGHT - 1 }) ===
    "legacy-pre-ctx",
  `#${LEGACY_SIG_ERA_END_HEIGHT - 1} is the last legacy height`,
);
check(
  sigEraFor({ networkId: CROWNED_NETWORK_ID, height: LEGACY_SIG_ERA_END_HEIGHT }) === "current",
  `#${LEGACY_SIG_ERA_END_HEIGHT} is the first current height`,
);
check(
  sigEraFor({ networkId: CROWNED_NETWORK_ID, height: 10_000_000 }) === "current",
  "the era is closed above — a far-future height is always current",
);
check(
  sigEraFor({ networkId: CROWNED_NETWORK_ID, height: -1 }) === "current" &&
    sigEraFor({ networkId: CROWNED_NETWORK_ID, height: 1.5 }) === "current",
  "a nonsense height fails closed to the strong rule, never the weak one",
);

// ── 3. the era does not exist off the crowned network ───────────────────────
for (const netId of [PIXEL_LAB_NETWORK_ID, 1, 31337, CROWNED_NETWORK_ID + 1]) {
  check(
    sigEraFor({ networkId: netId, height: 0 }) === "current",
    `network ${netId} has no legacy era, even at height 0`,
  );
}

// A real legacy signature from the crowned chain must be refused when replayed on a
// lab network — the weak rule cannot be imported onto a chain an attacker forges.
const legacyPixel = fx.pixels[0]!;
const legacyProofOkOnCrowned = await verifyLightProof(
  legacyPixel.lightProof,
  legacyPixel.lightProof.sequencerAddress,
  signaturePolicyAtHeight({ networkId: CROWNED_NETWORK_ID, height: 0 }).verify,
);
const legacyProofOkOnLab = await verifyLightProof(
  legacyPixel.lightProof,
  legacyPixel.lightProof.sequencerAddress,
  signaturePolicyAtHeight({ networkId: PIXEL_LAB_NETWORK_ID, height: 0 }).verify,
);
check(legacyProofOkOnCrowned, "a real legacy proof verifies at its own height on the crowned net");
check(!legacyProofOkOnLab, "the same legacy proof is REFUSED on a lab network");

// ── 4. no fallback: a legacy signature is refused past the boundary ─────────
const legacyProofPastBoundary = await verifyLightProof(
  legacyPixel.lightProof,
  legacyPixel.lightProof.sequencerAddress,
  signaturePolicyAtHeight({
    networkId: CROWNED_NETWORK_ID,
    height: LEGACY_SIG_ERA_END_HEIGHT,
  }).verify,
);
check(
  !legacyProofPastBoundary,
  `a legacy-form proof is REFUSED at #${LEGACY_SIG_ERA_END_HEIGHT} — no downgrade oracle`,
);

// …and a current signature is refused *inside* the legacy era, so the rule is a
// rule rather than a widening.
const kp = await generatePixelKeypair("PIX-ML-DSA-65");
const freshMessage = "pols|era-probe";
const freshSig = await signPixel(freshMessage, kp);
check(
  await verifySignatureAtHeight({
    message: freshMessage,
    signatureJson: freshSig,
    publicKey: kp.publicKey,
    networkId: CROWNED_NETWORK_ID,
    height: LEGACY_SIG_ERA_END_HEIGHT,
  }),
  "a freshly signed signature verifies at a current height",
);
check(
  !(await verifySignatureAtHeight({
    message: freshMessage,
    signatureJson: freshSig,
    publicKey: kp.publicKey,
    networkId: CROWNED_NETWORK_ID,
    height: 0,
  })),
  "the same fresh signature is REFUSED inside the legacy era — exactly one era per height",
);

// ── 5. legacy transaction spends resolve their scheme, not just their signature ──
// Swapping the verifier while leaving the strict scheme reader in place still broke
// every legacy OTS spend, because authorization could not derive an address. The
// policy is a pair for that reason, so assert the pair.
let legacyOtsChecked = 0;
for (const px of fx.pixels) {
  if (px.index >= LEGACY_SIG_ERA_END_HEIGHT) break;
  for (const tx of px.transactions as Transaction[]) {
    if (tx.inputs.length === 0) continue;
    const sig = tx.inputs[0]!.signature!;
    if (!sig.includes("PIX-HASH-OTS-128")) continue;
    const policy = signaturePolicyAtHeight({ networkId: CROWNED_NETWORK_ID, height: px.index });
    const message = `${tx.commitment}|${canonicalTxBody(tx)}`;
    const schemeOk = policy.schemeOf(sig) === "PIX-HASH-OTS-128";
    const verifyOk = await policy.verify(message, sig, tx.inputs[0]!.publicKey!);
    if (schemeOk && verifyOk) legacyOtsChecked++;
  }
}
check(legacyOtsChecked > 0, `legacy OTS spends resolve scheme AND signature (${legacyOtsChecked})`);

// ── 6. the legacy module cannot sign ───────────────────────────────────────
// `Sign(?!ature)` so `legacySignatureEraThesis` — prose about signatures — does not
// read as a signing capability, while `signFoo` / `makeSigner` still would.
const signish = Object.keys(legacySig).filter(
  (k) => /^sign/.test(k) || /Sign(?!ature)/.test(k) || /signer/i.test(k),
);
check(
  signish.length === 0,
  `legacy-sig.ts exports no signing symbol${signish.length ? ` (found ${signish.join(", ")})` : ""}`,
);

const source = await Bun.file(new URL("../src/lib/pixel/legacy-sig.ts", import.meta.url)).text();
check(
  !/ml_dsa65\.sign|signLightFull/.test(source),
  "legacy-sig.ts never calls a signing primitive",
);

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log("═══ PASS — one era per height, closed above, crowned-only, read-only ═══");

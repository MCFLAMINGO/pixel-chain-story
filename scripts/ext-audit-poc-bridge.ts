#!/usr/bin/env bun
/**
 * Adversarial regression suite — Gate I external audit (bridge / ULA / crypto).
 *
 * Inverted assertions: a scenario passes only when the attack is REJECTED.
 * Covers PIX-06, PIX-07, PIX-08, PIX-09, PIX-10, PIX-11, PIX-16, PIX-20.
 */

import { hashBridgeMessage, verifyAttestation } from "../src/lib/pixel/bridge";
import {
  buildMldsaGateReceipt,
  mldsaGateCommit,
  labMldsaUlaChain,
} from "../src/lib/pixel/ula-mldsa";
import { assertVaultReleaseAuthorized, consumeVaultRelease } from "../src/lib/pixel/bridge-custody";
import { prepareIngress, type PreparedIngress } from "../src/lib/pixel/worldlight";
import {
  OTS_LEAF_COUNT,
  generateLightKeypair,
  restoreLightKeypair,
  signLightFull,
  verifyLightFull,
  hexToBytes,
} from "../src/lib/pixel/crypto";
import { signPixel, verifyPixel } from "../src/lib/pixel/scheme";
import { runSuite, exploited, scenario } from "./ext-audit-harness";

// ── PIX-06 ────────────────────────────────────────────────────────────────────
scenario("PIX-06", "rewrite bridge amount + recipient under a genuine signature", async () => {
  const { attestation } = await labMldsaUlaChain();
  const trusted = [attestation.lightProof.sequencerAddress];

  const before = await verifyAttestation(attestation, trusted);
  if (!before.ok) throw new Error(`baseline attestation invalid (${before.reason}) — inconclusive`);

  // Genuine lightProof, forged payload.
  const forged = structuredClone(attestation);
  forged.message.amount = 1_000_000_000;
  forged.message.toAddress = "0xATTACKER";
  forged.messageHash = await hashBridgeMessage(forged.message);

  const after = await verifyAttestation(forged, trusted);
  if (after.ok) {
    exploited(
      `verifyAttestation ok on rewritten message (amount=${forged.message.amount}, to=${forged.message.toAddress})`,
    );
  }
  throw new Error(`rewritten message rejected: ${after.reason}`);
});

// ── PIX-07 ────────────────────────────────────────────────────────────────────
scenario("PIX-07", "self-authorizing gate receipt from an unregistered sequencer", async () => {
  // Attacker's own throwaway chain — registered with nobody.
  const { attestation } = await labMldsaUlaChain({ memo: "attacker-private-chain" });
  const res = await buildMldsaGateReceipt(attestation);
  if (res.ok) {
    exploited(
      `gate receipt built for unregistered sequencer ${attestation.lightProof.sequencerAddress.slice(0, 14)}…`,
    );
  }
  throw new Error(`gate rejected: ${res.reason}`);
});

// ── PIX-08 ────────────────────────────────────────────────────────────────────
scenario("PIX-08", "gate commit collides for full vs truncated messageHash", async () => {
  const publicKey = "aa".repeat(64);
  const signature = JSON.stringify({ alg: "PIX-ML-DSA-65", sig: "bb".repeat(64) });
  const full = "cd".repeat(64); // 128 hex chars = SHA-512 width
  const half = full.slice(0, 64);

  let commitFull: string;
  let commitHalf: string;
  try {
    commitFull = mldsaGateCommit({ publicKey, messageHash: full, signature });
  } catch (e) {
    throw new Error(`full-width messageHash rejected: ${(e as Error).message}`);
  }
  try {
    commitHalf = mldsaGateCommit({ publicKey, messageHash: half, signature });
  } catch {
    // Rejecting the wrong width is the fix.
    throw new Error("truncated messageHash rejected");
  }
  if (commitFull === commitHalf) {
    exploited("full and truncated messageHash produce an identical commit");
  }
  throw new Error("commits differ — no silent truncation");
});

// ── PIX-09 ────────────────────────────────────────────────────────────────────
scenario("PIX-09", "fabricated $1 lock authorizes a 1,000,000 PIX vault release", async () => {
  const owner = { address: `pix1${"a".repeat(38)}`, localId: "victim-vault" };
  const prepared = await prepareIngress({
    kind: "usd_value",
    name: "$1 USD",
    ownerAddress: owner.address,
    ownerLocalId: owner.localId,
    valueLock: {
      asset: "USD",
      amount: 1,
      venue: "bank_wire",
      foreignRef: "I-PROMISE-I-LOCKED-IT",
      lockDigest: "00",
    },
  });

  // Inflate the credit far beyond the declared lock.
  const tampered: PreparedIngress = {
    ...prepared,
    pixCredit: 1_000_000,
    bridgeMessage: prepared.bridgeMessage
      ? { ...prepared.bridgeMessage, amount: 1_000_000 }
      : undefined,
  };
  assertVaultReleaseAuthorized(tampered);
  exploited("release authorized for unverifiable lock with credit unbound to locked amount");
});

// ── PIX-09b ───────────────────────────────────────────────────────────────────
scenario("PIX-09b", "replay the same foreign receipt twice", async () => {
  const owner = { address: `pix1${"b".repeat(38)}`, localId: "replay-vault" };
  const mk = async () =>
    prepareIngress({
      kind: "usd_value",
      name: "$5 USD",
      ownerAddress: owner.address,
      ownerLocalId: owner.localId,
      valueLock: {
        asset: "USDC",
        amount: 5,
        venue: "ethereum",
        foreignRef: "0xreplay-me",
        lockDigest: "ab".repeat(64),
      },
    });

  const first = await mk();
  assertVaultReleaseAuthorized(first);
  consumeVaultRelease(first);
  const second = await mk();
  assertVaultReleaseAuthorized(second);
  consumeVaultRelease(second);
  exploited("the same foreignRef authorized a release twice (no consumed-receipt set)");
});

// ── PIX-10 ────────────────────────────────────────────────────────────────────
scenario("PIX-10", "OTS commitment halves narrower than the advertised strength", async () => {
  const kp = await generateLightKeypair();
  const sig = await signLightFull("pix-audit-strength", kp);
  const parsed = JSON.parse(sig) as { revealed: string[]; complements: string[] };
  const halfBits = parsed.complements[0]!.length * 4;
  const digestBits = parsed.revealed.length;
  if (halfBits < 256) {
    exploited(
      `commitment half is ${halfBits} bits (need >= 256); signed digest is ${digestBits} bits`,
    );
  }
  if (digestBits < 256) {
    exploited(`signed digest is only ${digestBits} bits (need >= 256)`);
  }
  throw new Error(`halves ${halfBits} bits, digest ${digestBits} bits — at target strength`);
});

// ── PIX-11 ────────────────────────────────────────────────────────────────────
scenario("PIX-11", "restore from seed twice and reuse OTS leaf 0", async () => {
  const kp = await generateLightKeypair();
  const seed = kp.seed;

  // Two independent restores that both default to the start of the window.
  const a = await restoreLightKeypair(hexToBytes(seed), undefined as unknown as number);
  const b = await restoreLightKeypair(hexToBytes(seed), undefined as unknown as number);
  const sigA = await signLightFull("message-A", a);
  const sigB = await signLightFull("message-B", b);
  const leafA = (JSON.parse(sigA) as { leafIndex: number }).leafIndex;
  const leafB = (JSON.parse(sigB) as { leafIndex: number }).leafIndex;
  const bothValid =
    (await verifyLightFull("message-A", sigA, kp.publicKey)) &&
    (await verifyLightFull("message-B", sigB, kp.publicKey));
  if (leafA === leafB && bothValid) {
    exploited(`two different messages signed under leaf ${leafA} (Lamport halves leaked)`);
  }
  throw new Error("independent restores did not reuse a leaf");
});

// ── PIX-16 ────────────────────────────────────────────────────────────────────
scenario("PIX-16", "OTS signature is not bound to its scheme / purpose", async () => {
  const kp = await generateLightKeypair();
  const message = "pix-cross-context-probe";
  const raw = await signLightFull(message, kp);

  // signLightFull must domain-separate exactly like signPixel does for ML-DSA.
  // If the raw digest is signed bare, a signature over the same bytes in a
  // different protocol context verifies here too.
  const bareVerifies = await verifyLightFull(message, raw, kp.publicKey);
  const taggedVerifies = await verifyLightFull(
    `pix-sig|PIX-HASH-OTS-128|${message}`,
    raw,
    kp.publicKey,
  );
  if (bareVerifies && !taggedVerifies) {
    exploited("OTS signs the bare message digest — no scheme/purpose tag in the signed payload");
  }
  throw new Error("OTS payload carries a domain tag");
});

// ── PIX-20 ────────────────────────────────────────────────────────────────────
scenario("PIX-20", "out-of-range leafIndex / wrong authPath length accepted", async () => {
  const kp = await generateLightKeypair();
  const message = "pix-leaf-bounds";
  const sig = await signLightFull(message, kp);
  const parsed = JSON.parse(sig) as { leafIndex: number; authPath: string[] };

  // leafIndex congruent modulo the tree width traverses an identical path.
  const aliased = { ...parsed, leafIndex: parsed.leafIndex + OTS_LEAF_COUNT };
  if (await verifyLightFull(message, JSON.stringify(aliased), kp.publicKey)) {
    exploited(`leafIndex ${aliased.leafIndex} >= leafCount ${OTS_LEAF_COUNT} verified`);
  }

  const shortPath = { ...parsed, authPath: parsed.authPath.slice(0, 2) };
  if (await verifyLightFull(message, JSON.stringify(shortPath), kp.publicKey)) {
    exploited("authPath of the wrong length verified");
  }
  throw new Error("leaf index and auth path bounds enforced");
});

// ── PIX-18 ────────────────────────────────────────────────────────────────────
scenario("PIX-18", "ML-DSA production signing is fully deterministic", async () => {
  const prev = process.env.PIXEL_DETERMINISTIC_SIG;
  delete process.env.PIXEL_DETERMINISTIC_SIG;
  try {
    const { generatePixelKeypair } = await import("../src/lib/pixel/scheme");
    const kp = await generatePixelKeypair("PIX-ML-DSA-65");
    const a = await signPixel("hedge-probe", kp);
    const b = await signPixel("hedge-probe", kp);
    const ok = await verifyPixel("hedge-probe", a, kp.publicKey);
    if (!ok) throw new Error("baseline signature invalid — inconclusive");
    if (a === b) {
      exploited("two signatures over the same message are byte-identical (no hedge)");
    }
    throw new Error("signing is hedged in production mode");
  } finally {
    if (prev !== undefined) process.env.PIXEL_DETERMINISTIC_SIG = prev;
  }
});

await runSuite("ext-audit-poc-bridge (bridge / ULA / crypto)");

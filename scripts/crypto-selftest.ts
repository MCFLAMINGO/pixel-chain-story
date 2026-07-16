/**
 * Crypto honesty — landmines closed.
 * bun scripts/crypto-selftest.ts
 */

import {
  OTS_LEAF_COUNT,
  addressFromPublicKey,
  generateLightKeypair,
  signLightFull,
  verifyLight,
  verifyLightFull,
} from "../src/lib/pixel/crypto";

async function main() {
  console.log("═══ CRYPTO LANDMINES ═══\n");

  const alice = await generateLightKeypair();
  const msgA = "transfer-one";
  const msgB = "transfer-other";

  // 1) Weak verifyLight is fail-closed
  const sig = await signLightFull(msgA, alice);
  if (await verifyLight(msgA, sig, alice.publicKey)) {
    throw new Error("verifyLight must never accept (fail-closed)");
  }
  if (await verifyLight(msgB, sig, alice.publicKey)) {
    throw new Error("verifyLight must never accept foreign messages");
  }
  console.log("▸ verifyLight fail-closed ✓");

  // 2) Full verify binds message
  if (!(await verifyLightFull(msgA, sig, alice.publicKey))) {
    throw new Error("verifyLightFull should accept matching message");
  }
  if (await verifyLightFull(msgB, sig, alice.publicKey)) {
    throw new Error("verifyLightFull must reject wrong message");
  }
  console.log("▸ verifyLightFull message-bound ✓");

  // 3) Address ↔ master public key
  const addr = await addressFromPublicKey(alice.publicKey);
  if (addr !== alice.address) throw new Error("address mismatch");
  console.log("▸ address binds master public key ✓");

  // 4) One-time leaves — exhaust window refuses reuse beyond count
  const bob = await generateLightKeypair();
  for (let i = bob.nextLeaf; i < OTS_LEAF_COUNT; i++) {
    await signLightFull(`leaf-${i}`, bob);
  }
  let threw = false;
  try {
    await signLightFull("one-too-many", bob);
  } catch (e) {
    threw = String(e).includes("OTS_EXHAUSTED");
  }
  if (!threw) throw new Error("expected OTS_EXHAUSTED after window");
  console.log(`▸ OTS window (${OTS_LEAF_COUNT}) enforced ✓`);

  console.log("\n═══ PASS — crypto landmines closed ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

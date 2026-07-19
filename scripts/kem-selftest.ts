/**
 * Lab PQ transport — ML-KEM-768 + XChaCha20-Poly1305.
 * bun scripts/kem-selftest.ts
 */
import {
  decapsulate,
  encapsulate,
  generateKemKeypair,
  openSealedText,
  sealTo,
  transportStatus,
} from "../src/lib/pixel/transport-kem";

async function main() {
  console.log("═══ PQ TRANSPORT (ML-KEM) ═══\n");

  const st = transportStatus();
  console.log("▸", st.claim);
  if (st.defaultMesh !== "plaintext") throw new Error("default mesh claim drift");

  const bob = generateKemKeypair();
  const enc = encapsulate(bob.publicKey);
  const ss = decapsulate(enc.ciphertext, bob.secretKey);
  if (ss !== enc.sharedSecret) throw new Error("decapsulate mismatch");
  console.log("▸ ML-KEM-768 encapsulate/decapsulate ✓");

  const box = await sealTo(bob.publicKey, "pixel-transport-lab");
  const plain = await openSealedText(box, bob.secretKey);
  if (plain !== "pixel-transport-lab") throw new Error("aead round-trip failed");
  console.log("▸ XChaCha20-Poly1305 seal/open ✓");

  const alice = generateKemKeypair();
  let rejected = false;
  try {
    await openSealedText(box, alice.secretKey);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("wrong sk must fail open");
  console.log("▸ wrong recipient rejected ✓");

  console.log("\n═══ PASS — lab ML-KEM transport (mesh still plaintext by default) ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

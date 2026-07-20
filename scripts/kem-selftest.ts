/**
 * Lab PQ transport — ML-KEM-768 + XChaCha20-Poly1305 + session frames.
 * bun scripts/kem-selftest.ts
 */
import {
  decapsulate,
  encapsulate,
  establishSessionAsInitiator,
  establishSessionAsResponder,
  generateKemKeypair,
  openFrameText,
  openSealedText,
  sealFrame,
  sealTo,
  transportKemEnabled,
  transportStatus,
} from "../src/lib/pixel/transport-kem";

async function main() {
  console.log("═══ PQ TRANSPORT (ML-KEM) ═══\n");

  const st = transportStatus();
  console.log("▸", st.claim);
  if (st.defaultMesh !== "plaintext") throw new Error("default mesh claim drift");
  if (st.optInEnv !== "PIXEL_TRANSPORT_KEM") throw new Error("opt-in env drift");
  if (transportKemEnabled() && process.env.PIXEL_TRANSPORT_KEM !== "1") {
    throw new Error("transportKemEnabled mismatch");
  }
  console.log("▸ defaultMesh plaintext · opt-in env PIXEL_TRANSPORT_KEM ✓");

  const bob = generateKemKeypair();
  const enc = encapsulate(bob.publicKey);
  const ss = decapsulate(enc.ciphertext, bob.secretKey);
  if (ss !== enc.sharedSecret) throw new Error("decapsulate mismatch");
  console.log("▸ ML-KEM-768 encapsulate/decapsulate ✓");

  const box = sealTo(bob.publicKey, "pixel-transport-lab");
  const plain = openSealedText(box, bob.secretKey);
  if (plain !== "pixel-transport-lab") throw new Error("aead round-trip failed");
  console.log("▸ XChaCha20-Poly1305 seal/open ✓");

  const alice = generateKemKeypair();
  let rejected = false;
  try {
    openSealedText(box, alice.secretKey);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("wrong sk must fail open");
  console.log("▸ wrong recipient rejected ✓");

  // Session path (gossip wire)
  const peer = generateKemKeypair();
  const init = establishSessionAsInitiator(peer.publicKey);
  const respKey = establishSessionAsResponder(init.kemCt, peer.secretKey);
  if (Buffer.from(init.aeadKey).toString("hex") !== Buffer.from(respKey).toString("hex")) {
    throw new Error("session keys diverge");
  }
  const frame = sealFrame(init.aeadKey, JSON.stringify({ type: "tx", n: 1 }));
  const opened = openFrameText(respKey, frame.nonce, frame.ciphertext);
  if (JSON.parse(opened).n !== 1) throw new Error("frame round-trip");
  console.log("▸ session establish + sealed frame ✓");

  console.log(
    "\n═══ PASS — lab ML-KEM transport (mesh plaintext unless PIXEL_TRANSPORT_KEM=1) ═══",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

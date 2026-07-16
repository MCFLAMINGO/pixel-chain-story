/**
 * NIST ML-DSA-65 path — quantum priority.
 * bun scripts/mldsa-selftest.ts
 */

import {
  createGenesis,
  generatePixelKeypair,
  proposeTransfer,
  quantumStatus,
  sequenceBlock,
  signPixel,
  verifyPixel,
  SCHEME_INFO,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ QUANTUM / ML-DSA ═══\n");

  const q = quantumStatus();
  if (q.priority !== "critical") throw new Error("quantum must be critical priority");
  if (!q.shipped.includes("PIX-ML-DSA-65")) throw new Error("ML-DSA not listed");
  console.log("▸", q.claim);
  console.log("▸", SCHEME_INFO["PIX-ML-DSA-65"].nist);

  const alice = await generatePixelKeypair("PIX-ML-DSA-65");
  const bob = await generatePixelKeypair("PIX-ML-DSA-65");
  if (alice.scheme !== "PIX-ML-DSA-65") throw new Error("scheme");
  if (!alice.secretKey) throw new Error("secretKey");

  const sig = await signPixel("pix-quantum-probe", alice);
  if (!(await verifyPixel("pix-quantum-probe", sig, alice.publicKey))) {
    throw new Error("ML-DSA verify failed");
  }
  if (await verifyPixel("other-message", sig, alice.publicKey)) {
    throw new Error("ML-DSA must bind message");
  }
  console.log("▸ ML-DSA-65 sign/verify message-bound ✓");

  // Full settlement path under ML-DSA sequencers + spenders
  let chain = await createGenesis(alice);
  const { state } = await proposeTransfer(chain, alice, [{ amount: 3, address: bob.address }], {
    description: "PQ transfer",
    recipientLabel: "@bob",
  });
  chain = await sequenceBlock(state, alice);
  if (chain.pixels.length < 2) throw new Error("no pixel");
  const proof = chain.pixels[1].lightProof;
  if (proof.scheme !== "PIX-ML-DSA-65") throw new Error("light proof scheme");
  console.log("▸ PoLS + UTXO settle under PIX-ML-DSA-65 ✓");

  // OTS still works (parallel scheme)
  const ots = await generatePixelKeypair("PIX-HASH-OTS-128");
  const otsSig = await signPixel("ots-still", ots);
  if (!(await verifyPixel("ots-still", otsSig, ots.publicKey))) {
    throw new Error("OTS path broken");
  }
  console.log("▸ PIX-HASH-OTS-128 still available ✓");

  console.log("\n═══ PASS — quantum schemes live ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

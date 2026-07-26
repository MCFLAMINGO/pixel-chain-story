/**
 * Zod + size-cap validation at signature / RPC boundaries.
 * bun run test:validators
 */

import {
  MAX_RPC_BODY_BYTES,
  MAX_SIGNATURE_JSON_BYTES,
  assertJsonSize,
  parseJsonWithSchema,
  parseMldsaSignatureJson,
  parseOtsSignatureJson,
  parseSignatureEnvelope,
  transactionSchema,
  validatorsThesis,
  ValidationError,
} from "../src/lib/pixel/validators";
import {
  generateLightKeypair,
  parseOtsLeafIndex,
  signLightFull,
  verifyLightFull,
} from "../src/lib/pixel/crypto";
import { generatePixelKeypair, signPixel, verifyPixel } from "../src/lib/pixel/scheme";
import { createDemoWallet, createGenesis, proposeTransfer } from "../src/lib/pixel/index";
import { verifyTransactionSignatures } from "../src/lib/pixel/transaction";
import { buildMldsaGateReceipt, labMldsaUlaChain } from "../src/lib/pixel/ula-mldsa";

async function main() {
  console.log("═══ VALIDATORS (ZOD + SIZE) ═══\n");

  if (!validatorsThesis().includes("Zod")) throw new Error("thesis");

  // Oversized signature rejected before parse work
  let oversized = false;
  try {
    assertJsonSize("x".repeat(MAX_SIGNATURE_JSON_BYTES + 1), MAX_SIGNATURE_JSON_BYTES, "sig");
  } catch (e) {
    oversized = e instanceof ValidationError;
  }
  if (!oversized) throw new Error("expected size reject");
  console.log("▸ assertJsonSize rejects oversized ✓");

  if (parseOtsSignatureJson("{not json") !== null) throw new Error("bad json");
  if (parseOtsSignatureJson(JSON.stringify({ alg: "PIX-HASH-OTS-128" })) !== null) {
    throw new Error("incomplete OTS must fail");
  }
  console.log("▸ OTS schema rejects garbage ✓");

  const otsKp = await generateLightKeypair();
  const otsSig = await signLightFull("validators-ots", otsKp);
  if (!parseOtsSignatureJson(otsSig)) throw new Error("valid OTS should parse");
  if (!(await verifyLightFull("validators-ots", otsSig, otsKp.publicKey))) {
    throw new Error("verifyLightFull after schema");
  }
  if (parseOtsLeafIndex(otsSig) !== 0) throw new Error("leaf index");
  console.log("▸ valid OTS envelope + verifyLightFull ✓");

  // Huge fake OTS leaf index / truncated arrays rejected
  const huge = "a".repeat(MAX_SIGNATURE_JSON_BYTES + 100);
  if (parseOtsLeafIndex(huge) !== null) throw new Error("oversized leaf peek");
  console.log("▸ parseOtsLeafIndex size gate ✓");

  const mldsaKp = await generatePixelKeypair();
  const mldsaSig = await signPixel("validators-mldsa", mldsaKp);
  if (!parseMldsaSignatureJson(mldsaSig)) throw new Error("valid ML-DSA should parse");
  if (!(await verifyPixel("validators-mldsa", mldsaSig, mldsaKp.publicKey))) {
    throw new Error("verifyPixel after schema");
  }
  if (parseSignatureEnvelope(mldsaSig)?.alg !== "PIX-ML-DSA-65") throw new Error("envelope");
  if (parseOtsLeafIndex(mldsaSig) !== null) throw new Error("ML-DSA has no OTS leaf");
  console.log("▸ valid ML-DSA envelope + verifyPixel ✓");

  const alice = await createDemoWallet("Alice");
  const bob = await createDemoWallet("Bob");
  const chain = await createGenesis(alice);
  const { tx } = await proposeTransfer(chain, alice, [{ address: bob.address, amount: 1 }], {
    description: "validators",
  });
  const txOk = transactionSchema.safeParse(tx);
  if (!txOk.success) throw new Error(`tx schema: ${JSON.stringify(txOk.error.flatten())}`);
  // validate-only parse must preserve key order (signed body)
  const wire = JSON.stringify(tx);
  const round = parseJsonWithSchema(wire, transactionSchema, {
    maxBytes: MAX_RPC_BODY_BYTES,
    label: "tx",
  });
  if (JSON.stringify(round) !== wire) {
    throw new Error("parseJsonWithSchema must not rebuild/reorder signed tx JSON");
  }
  if (!(await verifyTransactionSignatures(round as typeof tx))) {
    throw new Error("tx must still verify after schema gate");
  }
  console.log("▸ live Transaction matches schema + wire-preserve ✓");

  const { attestation } = await labMldsaUlaChain();
  const gate = await buildMldsaGateReceipt(attestation);
  if (!gate.ok) throw new Error(gate.reason);
  console.log("▸ buildMldsaGateReceipt with schema ✓");

  // Tampered light proof signature fails schema in gate path
  const badAtt = {
    ...attestation,
    lightProof: { ...attestation.lightProof, signature: '{"alg":"PIX-ML-DSA-65"}' },
  };
  const badGate = await buildMldsaGateReceipt(badAtt);
  if (badGate.ok) throw new Error("incomplete ML-DSA should fail gate");
  console.log("▸ gate rejects incomplete ML-DSA sig ✓");

  console.log("\n═══ PASS — validators zod + size caps ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

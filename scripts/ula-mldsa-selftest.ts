/**
 * ML-DSA native ULA + EVM twin projection + gate commit.
 * bun scripts/ula-mldsa-selftest.ts
 */
import { verifyAttestation } from "../src/lib/pixel/bridge";
import { schemeFromSignature } from "../src/lib/pixel/scheme";
import {
  buildMldsaGateReceipt,
  labMldsaUlaChain,
  projectMldsaUlaToEvmTwin,
} from "../src/lib/pixel/ula-mldsa";

async function main() {
  console.log("═══ ULA × ML-DSA ═══\n");

  const { state, attestation } = await labMldsaUlaChain();
  const trusted = state.sequencers.map((s) => s.address);
  const v = await verifyAttestation(attestation, trusted);
  if (!v.ok) throw new Error(v.reason ?? "native ULA failed");
  const alg = schemeFromSignature(attestation.lightProof.signature);
  if (alg !== "PIX-ML-DSA-65") throw new Error(`want ML-DSA light proof, got ${alg}`);
  console.log("▸ native ULA verifies under PIX-ML-DSA-65 sequencer ✓");

  const { pkg } = await projectMldsaUlaToEvmTwin(attestation);
  if (pkg.scheme !== "PIX-HASH-OTS-128-KECCAK") throw new Error("twin scheme drift");
  console.log("▸ projected to keccak-OTS EVM twin ✓");

  const gate = await buildMldsaGateReceipt(attestation);
  if (!gate.ok) throw new Error(gate.reason);
  if (gate.receipt.commit.length !== 64) throw new Error("commit len");
  if (gate.receipt.mldsaPkHash.length !== 64) throw new Error("pkHash len");
  console.log("▸ off-chain ML-DSA gate receipt commit ✓", gate.receipt.commit.slice(0, 16) + "…");
  console.log("▸ (on-chain Dilithium verify still PENDING — see docs/ULA-MLDSA.md)");

  console.log("\n═══ PASS — ML-DSA ULA path (native + twin + gate) ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

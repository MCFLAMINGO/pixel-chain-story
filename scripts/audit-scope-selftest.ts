/**
 * Gate I — audit package invariants (not “audited”).
 * bun scripts/audit-scope-selftest.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SCHEME, quantumStatus } from "../src/lib/pixel/scheme";
import { transportStatus } from "../src/lib/pixel/transport-kem";

async function main() {
  console.log("═══ GATE I — AUDIT SCOPE PACKAGE ═══\n");

  const root = join(import.meta.dir, "..");
  for (const f of ["docs/AUDIT.md", "docs/THREAT-MODEL.md", "docs/ULA-MLDSA.md"]) {
    if (!existsSync(join(root, f))) throw new Error(`missing ${f}`);
  }
  const audit = readFileSync(join(root, "docs/AUDIT.md"), "utf8");
  if (!audit.includes("PREPARING")) throw new Error("AUDIT.md must say PREPARING");
  if (/Status:.*[Aa]udited/.test(audit.split("\n")[0] ?? "")) {
    throw new Error("AUDIT.md must not claim Audited yet");
  }
  console.log("▸ docs/AUDIT.md PREPARING (not audited) ✓");

  const threat = readFileSync(join(root, "docs/THREAT-MODEL.md"), "utf8");
  if (!threat.includes("v1.1") && !threat.includes("Frozen:")) {
    throw new Error("THREAT-MODEL must carry freeze marker");
  }
  console.log("▸ threat model freeze marker ✓");

  if (DEFAULT_SCHEME !== "PIX-ML-DSA-65") throw new Error("default scheme drift");
  const q = quantumStatus();
  if (!q.shipped.includes("PIX-ML-DSA-65")) throw new Error("ML-DSA not shipped in status");
  console.log("▸ DEFAULT_SCHEME ML-DSA-65 ✓");

  const ula = readFileSync(join(root, "contracts/ULAVerifier.sol"), "utf8");
  if (!ula.includes("IS_STUB = false")) throw new Error("ULAVerifier stubbed");
  console.log("▸ ULAVerifier IS_STUB=false ✓");

  const gate = readFileSync(join(root, "contracts/ULAOffchainMldsaGate.sol"), "utf8");
  if (!gate.includes("IS_FULL_MLDSA_VERIFY = false")) throw new Error("gate overclaims");
  if (!gate.includes("ML_DSA_ONCHAIN_PENDING")) throw new Error("missing pending revert");
  console.log("▸ ULAOffchainMldsaGate honest (not full on-chain Dilithium) ✓");

  const t = transportStatus();
  if (t.defaultMesh !== "plaintext") throw new Error("transport overclaims default mesh");
  console.log("▸ ML-KEM lab shipped; default mesh plaintext ✓");

  // Touch acceptBlock export surface
  const { acceptBlock, createGenesis } = await import("../src/lib/pixel/chain");
  if (typeof acceptBlock !== "function" || typeof createGenesis !== "function") {
    throw new Error("acceptBlock surface missing");
  }
  console.log("▸ acceptBlock (docs: acceptPixel) export surface ✓");

  console.log("\n═══ PASS — audit package prepared; external review pending ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

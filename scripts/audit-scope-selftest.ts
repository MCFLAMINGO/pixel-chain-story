/**
 * Gate I — audit package invariants (not “audited”).
 * bun scripts/audit-scope-selftest.ts
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SCHEME, quantumStatus } from "../src/lib/pixel/scheme";
import { transportStatus } from "../src/lib/pixel/transport-kem";

/**
 * Protocol surface — every module classified, and the boundary enforced.
 *
 * `docs/PROTOCOL-SURFACE.md` says nineteen of the eighty-five modules under
 * `src/lib/pixel` are the protocol and the rest are not. A document saying that is
 * worth something; a build that fails when it stops being true is worth more.
 *
 * Two rules:
 *
 *   1. Every module is classified. A new file fails the build until someone says what
 *      it is, which is the only way the list stays complete without anyone policing it.
 *   2. **No consensus module may import a model.** Models are reasoning, not rules —
 *      the moment one is imported by the accept path it has silently become a rule
 *      nobody reviewed as one.
 */
function checkProtocolSurface(root: string): void {
  const CONSENSUS = new Set([
    "chain",
    "pol",
    "transaction",
    "membership",
    "sig-era",
    "legacy-sig",
    "economics",
    "limits",
    "crypto",
    "scheme",
    "light-digest",
    "light-color",
    "field-witness",
    "wave",
    "spatial-picture",
    "optical",
    "gift-and-record",
    "sovereignty",
    "crowned-genesis",
  ]);

  /** Reasoning, measurement and argument. Enforced by nothing, by definition. */
  const MODELS = new Set([
    "presence-peg",
    "economy-model",
    "mint-harm",
    "energy-truth",
    "farm-signature",
    "lit-supply",
    "end-state",
    "uptake",
    "expression",
    "interactions",
    "provenance",
  ]);

  /** Doors: not block validity, but the surface an attacker knocks on. */
  const GATEWAY = new Set(["mempool", "wire-schema", "validators", "rate-limit"]);

  /** Products and plumbing — wallets, bridges, Continuity, optical, UI feeds. */
  const SURFACE = new Set([
    "access",
    "anchor",
    "anchor-evm",
    "anchor-venues",
    "benchmark",
    "bootstrap",
    "bridge",
    "bridge-custody",
    "browser-eth-lock",
    "build-marker",
    "canvas-id",
    "chain-mirror",
    "chain-mirror-idb",
    "continuity-invite-pack",
    "continuity-ops",
    "continuity-settlement",
    "custody",
    "eth-usdc-lock",
    "firefly",
    "index",
    "kindling",
    "lattice",
    "light-client",
    "lit-cell",
    "lock-feeder",
    "lock-lead",
    "one",
    "optical-capture",
    "optical-profile",
    "pay-face-optical",
    "pay-link",
    "pay-matrix-scan",
    "pay-qr-scan",
    "peer-score",
    "people-wallet",
    "people-wallet-idb",
    "people-wallet-seal",
    "people-wallet-webauthn",
    "rpc",
    "siso",
    "spatial-index",
    "spatial-sink",
    "tip-host-contract",
    "tip-mark",
    "transport-kem",
    "ula-evm",
    "ula-mldsa",
    "wallet-bridge",
    "wave-bus",
    "wave-rules",
    "worldlight",
  ]);

  const dir = join(root, "src/lib/pixel");
  const modules = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => f.replace(/\.ts$/, ""));

  const unclassified = modules.filter(
    (m) => !CONSENSUS.has(m) && !MODELS.has(m) && !GATEWAY.has(m) && !SURFACE.has(m),
  );
  if (unclassified.length > 0) {
    throw new Error(
      `unclassified module(s): ${unclassified.join(", ")} — add to CONSENSUS, MODELS, ` +
        `GATEWAY or SURFACE in this file and to docs/PROTOCOL-SURFACE.md`,
    );
  }

  const stale = [...CONSENSUS, ...MODELS, ...GATEWAY, ...SURFACE].filter(
    (m) => !modules.includes(m),
  );
  if (stale.length > 0) {
    throw new Error(`classified module(s) that no longer exist: ${stale.join(", ")}`);
  }
  console.log(
    `\u25b8 all ${modules.length} pixel modules classified ` +
      `(${CONSENSUS.size} consensus, ${MODELS.size} models) \u2713`,
  );

  // The rule that matters: consensus must not depend on reasoning.
  const violations: string[] = [];
  for (const m of CONSENSUS) {
    const src = readFileSync(join(dir, `${m}.ts`), "utf8");
    for (const match of src.matchAll(/from "\.\/([a-z0-9-]+)"/g)) {
      if (MODELS.has(match[1]!)) violations.push(`${m}.ts imports model ${match[1]}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `consensus imports a model: ${violations.join("; ")} — a rule that lives in a ` +
        `model is a rule nobody reviewed as one. Move it into the accept path or drop it.`,
    );
  }
  console.log("\u25b8 no consensus module imports a model \u2713");

  // The doc must agree with the registry, or it becomes decoration.
  const doc = readFileSync(join(root, "docs/PROTOCOL-SURFACE.md"), "utf8");
  for (const m of CONSENSUS) {
    if (!doc.includes(`\`${m}.ts\``)) {
      throw new Error(`docs/PROTOCOL-SURFACE.md does not list consensus module ${m}.ts`);
    }
  }
  for (const m of MODELS) {
    if (!doc.includes(`\`${m}.ts\``)) {
      throw new Error(`docs/PROTOCOL-SURFACE.md does not list model ${m}.ts`);
    }
  }
  console.log("\u25b8 docs/PROTOCOL-SURFACE.md matches the registry \u2713");
}

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

  // PIX-01: the non-authorizing verifier must never reach a consensus path.
  const chain = readFileSync(join(root, "src/lib/pixel/chain.ts"), "utf8");
  if (chain.includes("verifySignatureShapeOnly")) {
    throw new Error(
      "chain.ts must not call verifySignatureShapeOnly — use the owner-binding verifier",
    );
  }
  if (!chain.includes("verifyTransactionSignaturesForOwners")) {
    throw new Error("chain.ts must bind input public keys to UTXO owners (PIX-01)");
  }
  console.log("\u25b8 acceptBlock uses the owner-binding verifier (PIX-01) \u2713");

  // PIX-12/22: the twin must not imply it verifies Pixel's native ML-DSA proofs.
  const verifier = readFileSync(join(root, "contracts/ULAVerifier.sol"), "utf8");
  if (!verifier.includes("IS_NATIVE_MLDSA_VERIFY = false")) {
    throw new Error("ULAVerifier must declare IS_NATIVE_MLDSA_VERIFY = false (PIX-12)");
  }
  if (!/MSG_BITS = 256/.test(verifier)) {
    throw new Error("ULAVerifier MSG_BITS must be 256 (PIX-12)");
  }
  console.log("\u25b8 on-chain twin: 256-bit OTS, relayer trust labelled (PIX-12) \u2713");

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

  checkProtocolSurface(root);

  console.log("\n═══ PASS — audit package prepared; external review pending ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

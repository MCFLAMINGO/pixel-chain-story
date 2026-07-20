/**
 * Lumen L0 — lightDigest / attest simplify the hash surface.
 * bun run test:lumen
 */

import { createDemoWallet, createGenesis, lightDigest } from "../src/lib/pixel/index";
import { TRANSFER_LUMEN, createHost, runLumenSource } from "../src/lumen/index";

async function main() {
  console.log("═══ LUMEN L0 — LIGHT DIGEST ═══\n");

  // 1) One door matches historical tx commitment separator
  const body = "inputs:[]|outputs:[]|meta:test|ts:1";
  const a = await lightDigest("superposition", body);
  const { sha512Hex } = await import("../src/lib/pixel/crypto");
  const b = await sha512Hex(`superposition|${body}`);
  if (a !== b) throw new Error("lightDigest superposition drifted from legacy");
  console.log("▸ lightDigest('superposition') ≡ legacy sha512 domain ✓");

  const commit = a;
  const txA = await lightDigest("txid", commit, body);
  const txB = await sha512Hex(`txid|${commit}|${body}`);
  if (txA !== txB) throw new Error("lightDigest txid drifted");
  console.log("▸ lightDigest('txid') ≡ legacy ✓");

  // 2) Lumen digest builtin — authors never write separators
  const alice = await createDemoWallet("Alice");
  const bob = await createDemoWallet("Bob");
  const chain = await createGenesis(alice);
  const host = createHost(chain, { alice, bob });

  const dig = await runLumenSource(
    `module D
ray go(x):
  let h = digest("creation", x)
  return h
`,
    "go",
    { x: { kind: "string", value: "first light" } },
    host,
  );
  if (dig.value.kind !== "string" || dig.value.value.length !== 128) {
    throw new Error("digest builtin failed");
  }
  const expect = await lightDigest("creation", "first light");
  if (dig.value.value !== expect) throw new Error("Lumen digest ≠ lightDigest");
  console.log("▸ Lumen digest() builtin ✓");

  // 3) exist ray — store of creation / attestation of existence
  const exist = await runLumenSource(
    TRANSFER_LUMEN,
    "exist",
    { what: { kind: "string", value: "Georges-point: I was here under light" } },
    createHost(chain, { alice, bob }),
  );
  if (exist.value.kind !== "proof") {
    throw new Error(`exist want proof got ${exist.value.kind}`);
  }
  if (!exist.value.light || exist.value.subject.length < 8) {
    throw new Error("proof incomplete");
  }
  if (!exist.host.painted.includes(exist.value.light)) {
    throw new Error("exist did not paint proof light");
  }
  console.log("▸ ray exist → proof painted ✓");
  console.log(`  light ${exist.value.light.slice(0, 24)}…`);
  console.log("\n═══ PASS — Lumen simplifies hash into light verbs ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

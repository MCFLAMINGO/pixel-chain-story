/**
 * Lumen L0 — lightDigest / attest + product rays (tip, kindle, shine_in).
 * bun run test:lumen
 */

import { balanceOf, createDemoWallet, createGenesis, lightDigest } from "../src/lib/pixel/index";
import { TRANSFER_LUMEN, createHost, runLumenSource } from "../src/lumen/index";

async function main() {
  console.log("═══ LUMEN L0 — LIGHT + PRODUCT RAYS ═══\n");

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
  const host = createHost(chain, { alice, bob }, alice, { bridgeVault: alice });

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
    createHost(chain, { alice, bob }, alice, { bridgeVault: alice }),
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

  // 4) tip_sense — living tip wave/spatial roots
  const tipRes = await runLumenSource(
    TRANSFER_LUMEN,
    "tip_sense",
    {},
    createHost(chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (tipRes.value.kind !== "tip") throw new Error(`tip_sense want tip got ${tipRes.value.kind}`);
  if (!tipRes.value.waveDigest || !tipRes.value.spatialRoot) {
    throw new Error("tip missing digests");
  }
  if (!tipRes.host.painted.includes(tipRes.value.waveDigest)) {
    throw new Error("tip_sense did not paint waveDigest");
  }
  console.log(
    "▸ ray tip_sense → tip #" + tipRes.value.index,
    tipRes.value.waveDigest.slice(0, 12) + "…",
  );

  // 5) holdings — real UTXO balance
  const hold = await runLumenSource(
    TRANSFER_LUMEN,
    "holdings",
    { who: { kind: "string", value: "alice" } },
    createHost(chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (hold.value.kind !== "number") throw new Error("holdings");
  if (hold.value.value !== balanceOf(chain, alice.address)) {
    throw new Error("holdings ≠ chain balance");
  }
  console.log("▸ ray holdings →", hold.value.value, "PIX ✓");

  // 6) kindle — Presence Seal → self-custody settle
  const kindled = await runLumenSource(
    TRANSFER_LUMEN,
    "kindle",
    {
      from: { kind: "string", value: "alice" },
      to: { kind: "string", value: "bob" },
      amount: { kind: "number", value: 2 },
      memo: { kind: "string", value: "lumen kindle" },
    },
    createHost(chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (kindled.value.kind !== "settled") throw new Error("kindle want settled");
  if (balanceOf(kindled.host.chain, bob.address) !== 2) {
    throw new Error(`kindle bob bal ${balanceOf(kindled.host.chain, bob.address)}`);
  }
  console.log("▸ ray kindle → Presence Seal settle ✓");

  // 7) shine_in — Worldlight $ → PIX on bob (alice is bridge vault)
  const shone = await runLumenSource(
    TRANSFER_LUMEN,
    "shine_in",
    {
      owner: { kind: "string", value: "bob" },
      usd: { kind: "number", value: 4 },
    },
    createHost(kindled.host.chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (shone.value.kind !== "settled") throw new Error("shine_in want settled");
  if (balanceOf(shone.host.chain, bob.address) !== 6) {
    throw new Error(`shine_in bob bal ${balanceOf(shone.host.chain, bob.address)}`);
  }
  const tip = shone.host.chain.pixels[shone.host.chain.pixels.length - 1]!;
  if (!tip.lightProof.waveDigest || !tip.lightProof.spatialRoot) {
    throw new Error("shine_in tip missing spatial roots");
  }
  console.log("▸ ray shine_in → $4 → PIX; tip wave/spatial bound ✓");

  console.log("\n═══ PASS — Lumen product rays bind real host APIs ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

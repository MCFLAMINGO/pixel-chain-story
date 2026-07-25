/**
 * Lumen L0 — product rays + language power (match, aperture, ensure, composition).
 * bun run test:lumen
 */

import { balanceOf, createDemoWallet, createGenesis, lightDigest } from "../src/lib/pixel/index";
import { TRANSFER_LUMEN, createHost, LumenRuntimeError, runLumenSource } from "../src/lumen/index";

async function main() {
  console.log("═══ LUMEN — PRODUCT + LANGUAGE POWER ═══\n");

  const body = "inputs:[]|outputs:[]|meta:test|ts:1";
  const a = await lightDigest("superposition", body);
  const { sha512Hex } = await import("../src/lib/pixel/crypto");
  const b = await sha512Hex(`superposition|${body}`);
  if (a !== b) throw new Error("lightDigest superposition drifted from legacy");
  console.log("▸ lightDigest('superposition') ≡ legacy sha512 domain ✓");

  const alice = await createDemoWallet("Alice");
  const bob = await createDemoWallet("Bob");
  const chain = await createGenesis(alice);

  const dig = await runLumenSource(
    `module D
ray go(x):
  let h = digest("creation", x)
  return h
`,
    "go",
    { x: { kind: "string", value: "first light" } },
    createHost(chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (dig.value.kind !== "string" || dig.value.value.length !== 128) {
    throw new Error("digest builtin failed");
  }
  console.log("▸ Lumen digest() builtin ✓");

  const exist = await runLumenSource(
    TRANSFER_LUMEN,
    "exist",
    { what: { kind: "string", value: "Georges-point: I was here under light" } },
    createHost(chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (exist.value.kind !== "proof") throw new Error(`exist want proof got ${exist.value.kind}`);
  console.log("▸ ray exist → proof painted ✓");

  const tipRes = await runLumenSource(
    TRANSFER_LUMEN,
    "tip_sense",
    {},
    createHost(chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (tipRes.value.kind !== "tip") throw new Error("tip_sense");
  console.log("▸ ray tip_sense ✓");

  // Field projection
  const wave = await runLumenSource(
    TRANSFER_LUMEN,
    "tip_wave",
    {},
    createHost(chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (wave.value.kind !== "string" || wave.value.value !== tipRes.value.waveDigest) {
    throw new Error("tip_wave field projection");
  }
  console.log("▸ field projection t.waveDigest ✓");

  // ensure + aperture + match + kindle
  const funded = await runLumenSource(
    TRANSFER_LUMEN,
    "funded_kindle",
    {
      from: { kind: "string", value: "alice" },
      to: { kind: "string", value: "bob" },
      amount: { kind: "number", value: 2 },
      memo: { kind: "string", value: "funded" },
    },
    createHost(chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (funded.value.kind !== "settled") throw new Error("funded_kindle");
  if (balanceOf(funded.host.chain, bob.address) !== 2) throw new Error("funded bal");
  console.log("▸ ensure + when aperture + match + kindle ✓");

  // Ray composition (pay_composed → funded_kindle)
  const composed = await runLumenSource(
    TRANSFER_LUMEN,
    "pay_composed",
    {
      from: { kind: "string", value: "alice" },
      to: { kind: "string", value: "bob" },
      amount: { kind: "number", value: 1 },
      memo: { kind: "string", value: "composed" },
    },
    createHost(funded.host.chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (composed.value.kind !== "settled") throw new Error("pay_composed");
  if (balanceOf(composed.host.chain, bob.address) !== 3) throw new Error("composed bal");
  console.log("▸ ray composition pay_composed → funded_kindle ✓");

  // ensure refuses dark amounts
  let refused = false;
  try {
    await runLumenSource(
      TRANSFER_LUMEN,
      "funded_kindle",
      {
        from: { kind: "string", value: "alice" },
        to: { kind: "string", value: "bob" },
        amount: { kind: "number", value: 9999 },
        memo: { kind: "string", value: "too much" },
      },
      createHost(composed.host.chain, { alice, bob }, alice, { bridgeVault: alice }),
    );
  } catch (e) {
    refused = e instanceof LumenRuntimeError && e.message.includes("insufficient light");
  }
  if (!refused) throw new Error("ensure should refuse overspend");
  console.log("▸ ensure refuse insufficient light ✓");

  // Ghost ownership — collapse consumes; re-veil refuses
  const own = await runLumenSource(
    `module Own
ray burn():
  ghost tx = commit("alice", "bob", 1, "own")
  when light:
    shine tx via sequence
    collapse tx
  veil tx private
  return tx
`,
    "burn",
    {},
    createHost(composed.host.chain, { alice, bob }, alice, { bridgeVault: alice }),
  ).then(
    () => false,
    (e) => e instanceof LumenRuntimeError && /already collapsed|ownership/.test(e.message),
  );
  if (!own) throw new Error("ghost ownership should refuse re-veil");
  console.log("▸ ghost ownership (collapse consumes) ✓");

  // if / else arithmetic
  const arith = await runLumenSource(
    `module A
ray go(n):
  if n > 10:
    return n - 1
  else:
    return n + 1
`,
    "go",
    { n: { kind: "number", value: 3 } },
    createHost(chain, { alice, bob }, alice),
  );
  if (arith.value.kind !== "number" || arith.value.value !== 4) throw new Error("if/else arith");
  console.log("▸ if/else + arithmetic ✓");

  // shine_in still works
  const shone = await runLumenSource(
    TRANSFER_LUMEN,
    "shine_in",
    {
      owner: { kind: "string", value: "bob" },
      usd: { kind: "number", value: 4 },
    },
    createHost(composed.host.chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (shone.value.kind !== "settled") throw new Error("shine_in");
  if (balanceOf(shone.host.chain, bob.address) !== 7) {
    throw new Error(`shine_in bob bal ${balanceOf(shone.host.chain, bob.address)}`);
  }
  console.log("▸ shine_in still host-bound ✓");

  console.log("\n═══ PASS — Lumen power class: match · aperture · ensure · compose · own ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

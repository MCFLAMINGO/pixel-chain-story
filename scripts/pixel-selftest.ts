/**
 * Executable proof — not theory.
 * Usage: bun run test:pixel
 */

import {
  ABSENT_COLOR,
  balanceOf,
  composePixelColor,
  createDemoWallet,
  createGenesis,
  handlePixelRpc,
  isColorAbsent,
  runPixelBenchmarks,
  verifyChain,
} from "../src/lib/pixel/index";
import { TRANSFER_LUMEN, createHost, runLumenSource } from "../src/lumen/index";

async function main() {
  console.log("═══ PIXEL EXECUTION PROOF ═══\n");

  const alice = await createDemoWallet("Alice");
  const bob = await createDemoWallet("Bob");
  let chain = await createGenesis(alice);

  // 1) Lumen program settles real balances
  console.log("▸ Lumen ray `send` executing…");
  const host = createHost(chain, { alice, bob });
  const beforeA = balanceOf(host.chain, alice.address);
  const beforeB = balanceOf(host.chain, bob.address);

  const result = await runLumenSource(
    TRANSFER_LUMEN,
    "send",
    {
      from: { kind: "string", value: "alice" },
      to: { kind: "string", value: "bob" },
      amount: { kind: "number", value: 777 },
      memo: { kind: "string", value: "Ethereum-grade executable settlement" },
    },
    host,
  );
  chain = result.host.chain;

  const afterA = balanceOf(chain, alice.address);
  const afterB = balanceOf(chain, bob.address);
  console.log("  logs:");
  for (const line of result.logs) console.log("   ·", line);
  console.log("  result:", JSON.stringify(result.value));
  console.log(`  Alice ${beforeA} → ${afterA}`);
  console.log(`  Bob   ${beforeB} → ${afterB}`);

  if (afterB - beforeB !== 777) {
    throw new Error(`FAIL: Bob did not receive 777 (got ${afterB - beforeB})`);
  }
  if (beforeA - afterA !== 777) {
    throw new Error(`FAIL: Alice did not spend 777`);
  }
  if (result.value.kind !== "settled") {
    throw new Error(`FAIL: expected settled value, got ${result.value.kind}`);
  }
  console.log("  ✓ Lumen settled real UTXO transfer\n");

  // 2) Optical maze key via Lumen
  console.log("▸ Lumen ray `read_key` (optical round-trip)…");
  const keyHost = createHost(chain, { alice, bob });
  const keyRes = await runLumenSource(
    TRANSFER_LUMEN,
    "read_key",
    { secret: { kind: "string", value: alice.seed } },
    keyHost,
  );
  if (keyRes.value.kind !== "string") throw new Error("optical recover failed");
  console.log("  ✓ optical key recovered via Lumen\n");

  // 3) JSON-RPC surface
  console.log("▸ JSON-RPC methods…");
  const ctx = {
    chain,
    networkId: 0x5049, // "PI"
    clientVersion: "Pixel/0.1.0-lumen",
  };
  const methods = [
    "pix_protocolInfo",
    "pix_blockNumber",
    "pix_verifyChain",
    "pix_getEnergyProfile",
    "web3_clientVersion",
  ];
  for (const method of methods) {
    const res = await handlePixelRpc(ctx, {
      jsonrpc: "2.0",
      id: 1,
      method,
      params: [],
    });
    if ("error" in res) throw new Error(`${method}: ${res.error.message}`);
    console.log(`  ✓ ${method}`);
  }
  const bal = await handlePixelRpc(ctx, {
    jsonrpc: "2.0",
    id: 2,
    method: "pix_getBalance",
    params: [bob.address],
  });
  if ("error" in bal || bal.result !== 777) {
    throw new Error("pix_getBalance mismatch");
  }
  console.log("  ✓ pix_getBalance = 777\n");

  // 4) Axiom: color absent without light; lit blocks have color + proximity
  console.log("▸ Light axiom…");
  const dark = await composePixelColor({
    index: 0,
    hash: "ab".repeat(64),
    prevHash: "00".repeat(64),
    merkleRoot: "cd".repeat(64),
    beacon: "ef".repeat(64),
    sequence: 0,
    timestamp: Date.now(),
    transactions: [],
    illuminated: false,
  });
  if (!isColorAbsent(dark.color) || dark.spectrum.illumination !== 0) {
    throw new Error("FAIL: unlit pixel must have absent color");
  }
  for (const b of chain.pixels) {
    if (!b.illuminated) throw new Error("on-chain block must be illuminated");
    if (isColorAbsent(b.color)) throw new Error("lit block must have color");
  }
  console.log("  ✓ void without light; color only under illumination");
  console.log("  ✓ ABSENT_COLOR is", ABSENT_COLOR);

  // 5) Chain validity
  if (!(await verifyChain(chain))) throw new Error("chain invalid");
  console.log("▸ verifyChain ✓\n");

  // 6) Benchmarks
  console.log("▸ Benchmarks (reproducible)…");
  const benches = await runPixelBenchmarks();
  for (const row of benches) {
    console.log(
      `  ${row.op.padEnd(32)} avg ${String(row.avgMs).padStart(7)}ms  p95 ${String(row.p95Ms).padStart(7)}ms  (${row.note})`,
    );
  }

  console.log("\n═══ PASS — executable protocol, not a whitepaper ═══");
}

main().catch((err) => {
  console.error("\nFAIL:", err);
  process.exit(1);
});

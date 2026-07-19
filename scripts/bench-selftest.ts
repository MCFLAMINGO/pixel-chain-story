/**
 * Gate F — regenerate docs/BENCH.md from executable benchmarks.
 * bun scripts/bench-selftest.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runPixelBenchmarks } from "../src/lib/pixel/benchmark.ts";
import {
  buildHeadersSync,
  createGenesis,
  generateLightKeypair,
  proveBalance,
  proposeTransfer,
  sequenceBlock,
  verifyBalanceProof,
  verifyHeaderChain,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ BENCH → docs/BENCH.md ═══\n");
  const rows = await runPixelBenchmarks();

  // Light-client ops
  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  let state = await createGenesis(alice);
  ({ state } = await proposeTransfer(state, alice, [{ amount: 3, address: bob.address }], {
    description: "bench-light",
  }));
  state = await sequenceBlock(state, alice);

  const t0 = performance.now();
  for (let i = 0; i < 20; i++) {
    const pkg = await buildHeadersSync(state);
    await verifyHeaderChain(pkg.headers);
  }
  const headerMs = (performance.now() - t0) / 20;

  const t1 = performance.now();
  for (let i = 0; i < 50; i++) {
    const proof = await proveBalance(state, bob.address);
    if (!proof || !(await verifyBalanceProof(proof))) throw new Error("proof");
  }
  const proofMs = (performance.now() - t1) / 50;

  const when = new Date().toISOString();
  const lines = [
    "# Pixel Ledger benchmarks",
    "",
    `Generated: \`${when}\` by \`bun run test:bench\`.`,
    "",
    "Reproducible lab numbers — not a marketing claim. Phone-capable path ≈ header + balance proof verify.",
    "",
    "| Operation | Samples | avg ms | p95 ms | Note |",
    "| --- | ---: | ---: | ---: | --- |",
  ];
  for (const r of rows) {
    lines.push(`| ${r.op} | ${r.samples} | ${r.avgMs} | ${r.p95Ms} | ${r.note} |`);
  }
  lines.push(
    `| verifyHeaderChain (tip) | 20 | ${headerMs.toFixed(2)} | — | Gate F headers-first |`,
  );
  lines.push(
    `| prove+verifyBalanceProof | 50 | ${proofMs.toFixed(2)} | — | Gate F light balance |`,
  );
  lines.push("");
  lines.push("## How to regenerate");
  lines.push("");
  lines.push("```bash");
  lines.push("bun run test:bench");
  lines.push("```");
  lines.push("");

  const out = resolve("docs/BENCH.md");
  writeFileSync(out, lines.join("\n"));
  console.log("wrote", out);
  for (const r of rows) {
    console.log(`  ${r.op}: avg=${r.avgMs}ms p95=${r.p95Ms}ms`);
  }
  console.log(`  headers: ${headerMs.toFixed(2)}ms`);
  console.log(`  balance proof: ${proofMs.toFixed(2)}ms`);
  console.log("\nOK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

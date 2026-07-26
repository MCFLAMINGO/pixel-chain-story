/**
 * Lumen — product rays, language power, types, persist beside chain.
 * bun run test:lumen
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { balanceOf, createDemoWallet, createGenesis, lightDigest } from "../src/lib/pixel/index";
import {
  TRANSFER_LUMEN,
  checkLumen,
  createHost,
  emptyLumenBundle,
  loadLumenBundleLocal,
  LumenRuntimeError,
  LumenTypeError,
  parseLumen,
  runLumenSource,
  saveLumenBundleLocal,
  upsertLumenModule,
  clearLumenBundleLocal,
  lumenPersistThesis,
} from "../src/lumen/index";
import { loadOrSeedLumenModules, lumenModulesPath } from "../src/node/lumen-store";

async function main() {
  console.log("═══ LUMEN — TYPES + PERSIST ═══\n");

  if (!lumenPersistThesis().includes("beside chain")) throw new Error("thesis");

  const body = "inputs:[]|outputs:[]|meta:test|ts:1";
  const a = await lightDigest("superposition", body);
  const { sha512Hex } = await import("../src/lib/pixel/crypto");
  if (a !== (await sha512Hex(`superposition|${body}`))) throw new Error("digest drift");
  console.log("▸ lightDigest ✓");

  const alice = await createDemoWallet("Alice");
  const bob = await createDemoWallet("Bob");
  const chain = await createGenesis(alice);

  // Typed Transfer module checks clean
  const mod = parseLumen(TRANSFER_LUMEN);
  const checked = checkLumen(mod);
  if (!checked.ok) {
    throw new Error(
      `Transfer type errors: ${checked.diagnostics.map((d) => d.message).join("; ")}`,
    );
  }
  console.log("▸ typed TRANSFER_LUMEN checkLumen ✓");

  // Type error caught
  let typedDark = false;
  try {
    await runLumenSource(
      `module Bad
ray go(x: number) -> string:
  return x
`,
      "go",
      { x: { kind: "number", value: 1 } },
      createHost(chain, { alice, bob }, alice),
    );
  } catch (e) {
    typedDark = e instanceof LumenTypeError;
  }
  if (!typedDark) throw new Error("expected LumenTypeError on return mismatch");
  console.log("▸ LumenTypeError on dark return ✓");

  const tipRes = await runLumenSource(
    TRANSFER_LUMEN,
    "tip_wave",
    {},
    createHost(chain, { alice, bob }, alice, { bridgeVault: alice }),
  );
  if (tipRes.value.kind !== "string" || tipRes.value.value.length < 16) {
    throw new Error("tip_wave");
  }
  console.log("▸ typed tip_wave field projection ✓");

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
  console.log("▸ funded_kindle (typed) ✓");

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
  if (balanceOf(composed.host.chain, bob.address) !== 3) throw new Error("composed bal");
  console.log("▸ pay_composed ✓");

  // Browser persist
  const map = new Map<string, string>();
  // @ts-expect-error test shim
  globalThis.localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
  clearLumenBundleLocal();
  let bundle = emptyLumenBundle({ name: "Transfer", source: TRANSFER_LUMEN });
  bundle = upsertLumenModule(bundle, TRANSFER_LUMEN);
  saveLumenBundleLocal(bundle);
  const again = loadLumenBundleLocal();
  if (!again || again.modules[0]?.name !== "Transfer") throw new Error("local persist");
  if (!again.modules[0]?.source.includes("funded_kindle")) throw new Error("source lost");
  console.log("▸ browser lumen-modules localStorage ✓");

  // Node datadir beside chain.json
  const dir = await mkdtemp(join(tmpdir(), "pixel-lumen-"));
  try {
    const seeded = await loadOrSeedLumenModules(dir, TRANSFER_LUMEN);
    if (seeded.modules[0]?.name !== "Transfer") throw new Error("seed name");
    const raw = await readFile(lumenModulesPath(dir), "utf8");
    if (!raw.includes("funded_kindle")) throw new Error("disk source");
    const reloaded = await loadOrSeedLumenModules(dir, "module Other\nray x():\n  return 1\n");
    if (reloaded.modules[0]?.name !== "Transfer") throw new Error("should not re-seed");
    console.log("▸ node lumen-modules.json beside chain ✓");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  // Ghost ownership still
  const own = await runLumenSource(
    `module Own
ray burn(from: string, to: string) -> settled:
  ghost tx: ghost = commit(from, to, 1, "own")
  when light:
    shine tx via sequence
    collapse tx
  veil tx private
  return tx
`,
    "burn",
    {
      from: { kind: "string", value: "alice" },
      to: { kind: "string", value: "bob" },
    },
    createHost(composed.host.chain, { alice, bob }, alice, { bridgeVault: alice }),
  ).then(
    () => false,
    (e) => e instanceof LumenRuntimeError && /ownership|already collapsed/.test(e.message),
  );
  if (!own) throw new Error("ghost ownership");
  console.log("▸ ghost ownership ✓");

  // Minimal REPL (example.lumen) — teaching surface, not product rays
  const { runLumen } = await import("../src/lumen/repl");
  const { readFileSync } = await import("node:fs");
  const prog = readFileSync("src/lumen/example.lumen", "utf8");
  const out = runLumen(prog);
  if (out[0] !== "5") throw new Error(`REPL expected 5, got ${out[0]}`);
  if (out[1] !== "50") throw new Error(`REPL expected 50, got ${out[1]}`);
  console.log("▸ minimal REPL example.lumen ✓");

  let lineErr = false;
  try {
    runLumen("let x = 1\nprint nope\n");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lineErr = msg.includes("line 2:") && msg.includes("Unknown identifier nope");
  }
  if (!lineErr) throw new Error("REPL should include line number in errors");
  console.log("▸ REPL line-numbered errors ✓");

  console.log("\n═══ PASS — Lumen types + persist beside chain ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

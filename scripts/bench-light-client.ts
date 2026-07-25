/**
 * Light-client micro-benchmark — computeStateRoot at multiple UTXO set sizes.
 *
 *   bun scripts/bench-light-client.ts
 *
 * Lab numbers only — not a marketing claim. See docs/BENCH.md / Gate F.
 */

import { computeStateRoot } from "../src/lib/pixel/light-client";
import type { PixelChainState, Utxo } from "../src/lib/pixel/chain";

function makeStateWithN(n: number): PixelChainState {
  const utxos = new Map<string, Utxo>();
  for (let i = 0; i < n; i++) {
    const addr = `pix1${(i % 20).toString(16).padStart(38, "0")}`;
    const txid = `tx${i}`;
    utxos.set(`${txid}:0`, {
      txid,
      vout: 0,
      amount: i % 10,
      address: addr,
    });
  }
  return {
    pixels: [],
    utxos,
    pending: [],
    sequencers: [],
    networkId: 0x5049,
    usedOtsLeaves: new Set(),
  };
}

async function medianMs(fn: () => Promise<void>, samples: number): Promise<number> {
  const times: number[] = [];
  await fn(); // warmup
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]!;
}

async function bench() {
  console.log("═══ LIGHT-CLIENT computeStateRoot BENCH ═══\n");
  for (const n of [0, 10, 100, 500, 1000]) {
    const state = makeStateWithN(n);
    let root = "";
    const samples = n >= 500 ? 5 : 11;
    const med = await medianMs(async () => {
      root = await computeStateRoot(state);
    }, samples);
    console.log(
      `computeStateRoot for ${n} utxos -> root ${root.slice(0, 8)}…, median=${med.toFixed(2)}ms (${samples} samples)`,
    );
  }
  console.log("\nRe-run: bun scripts/bench-light-client.ts");
}

bench().catch((e) => {
  console.error(e);
  process.exit(1);
});

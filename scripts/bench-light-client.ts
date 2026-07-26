/**
 * Light-client micro-benchmark — computeStateRoot at multiple UTXO set sizes.
 *
 *   bun scripts/bench-light-client.ts
 *
 * Lab numbers only — not a marketing claim. See docs/BENCH.md / Gate F.
 */

import { computeStateRoot } from "../src/lib/pixel/light-client";
import { addressFromPublicKey, isPixelAddress } from "../src/lib/pixel/crypto";
import type { PixelChainState, Utxo } from "../src/lib/pixel/chain";

/**
 * Build a lab state with N UTXOs.
 * Addresses are canonical `pix1` + 38 hex via `addressFromPublicKey` (not short
 * synthetic stubs) so they stay valid if later fed to `assertPixelAddress`.
 */
async function makeStateWithN(n: number): Promise<PixelChainState> {
  const utxos = new Map<string, Utxo>();
  const addrCache = new Map<number, string>();
  for (let i = 0; i < n; i++) {
    const bucket = i % 20;
    let addr = addrCache.get(bucket);
    if (!addr) {
      // Deterministic fake "pubkey" hex → real-shaped pix1 address
      const fakePk = bucket.toString(16).padStart(64, "0");
      addr = await addressFromPublicKey(fakePk);
      if (!isPixelAddress(addr)) {
        throw new Error(`bench synthetic address not canonical: ${addr}`);
      }
      addrCache.set(bucket, addr);
    }
    const txid = `tx${i.toString(16).padStart(8, "0")}`;
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
    const state = await makeStateWithN(n);
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

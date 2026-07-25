import { performance } from "perf_hooks";
import { computeStateRoot } from "../src/lib/pixel/light-client";

function makeStateWithN(n: number) {
  const utxos = new Map();
  for (let i = 0; i < n; i++) {
    utxos.set(`tx${i}:0`, { txid: `tx${i}`, vout: 0, amount: i % 10, address: `pix1${(i % 20).toString(16).padStart(2, "0")}` });
  }
  return {
    pixels: [],
    utxos,
    pending: [],
    sequencers: [],
    networkId: 0x5049,
    usedOtsLeaves: new Set(),
  } as any;
}

async function bench() {
  for (const n of [0, 10, 100, 500, 1000]) {
    const state = makeStateWithN(n);
    const t0 = performance.now();
    const root = await computeStateRoot(state);
    const t1 = performance.now();
    console.log(`computeStateRoot for ${n} utxos -> root ${root.slice(0,8)}..., time=${(t1-t0).toFixed(2)}ms`);
  }
}

bench().catch((e) => { console.error(e); process.exit(1); });

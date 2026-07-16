/**
 * Executable benchmarks — numbers Ethereum reviewers can reproduce.
 */

import {
  createDemoWallet,
  createGenesis,
  proposeTransfer,
  sequenceBlock,
  verifyChain,
  generateLightKeypair,
  signLightFull,
  verifyLightFull,
  encodeHexAsLight,
  simulateCameraCapture,
  verifyCapturedPattern,
} from "./index";

export interface BenchRow {
  op: string;
  samples: number;
  avgMs: number;
  p95Ms: number;
  note: string;
}

async function timeMany(n: number, fn: () => Promise<void>): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  return times;
}

function stats(times: number[]): { avgMs: number; p95Ms: number } {
  const sorted = [...times].sort((a, b) => a - b);
  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { avgMs: round(avgMs), p95Ms: round(p95Ms) };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function runPixelBenchmarks(): Promise<BenchRow[]> {
  const rows: BenchRow[] = [];

  const keyTimes = await timeMany(3, async () => {
    await generateLightKeypair();
  });
  rows.push({
    op: "generateLightKeypair (hash-OTS)",
    samples: 3,
    ...stats(keyTimes),
    note: "quantum-resistant keygen; once per wallet",
  });

  const alice = await createDemoWallet("Alice");
  const bob = await createDemoWallet("Bob");
  let chain = await createGenesis(alice);

  const msg = "pix-bench-message";
  const signTimes = await timeMany(5, async () => {
    await signLightFull(msg, alice);
  });
  rows.push({
    op: "signLightFull",
    samples: 5,
    ...stats(signTimes),
    note: "per-transaction signature",
  });

  const sig = await signLightFull(msg, alice);
  const verifyTimes = await timeMany(5, async () => {
    const ok = await verifyLightFull(msg, sig, alice.publicKey);
    if (!ok) throw new Error("verify failed");
  });
  rows.push({
    op: "verifyLightFull",
    samples: 5,
    ...stats(verifyTimes),
    note: "phone-capable verification",
  });

  const transferTimes = await timeMany(3, async () => {
    const { state, tx } = await proposeTransfer(
      chain,
      alice,
      [{ amount: 1, address: bob.address }],
      { description: "bench", recipientLabel: "@bob" },
    );
    chain = await sequenceBlock(state);
    if (tx.state === "superposition" && chain.pending.length !== 0) {
      /* sequenced clears pending */
    }
  });
  rows.push({
    op: "propose + PoLS sequenceBlock",
    samples: 3,
    ...stats(transferTimes),
    note: "full real settlement path",
  });

  const verifyChainTimes = await timeMany(3, async () => {
    const ok = await verifyChain(chain);
    if (!ok) throw new Error("chain invalid");
  });
  rows.push({
    op: "verifyChain",
    samples: 3,
    ...stats(verifyChainTimes),
    note: "full cryptographic audit of ledger",
  });

  const opticalTimes = await timeMany(5, async () => {
    const pattern = await encodeHexAsLight(alice.seed);
    const captured = simulateCameraCapture(pattern, 0);
    const result = await verifyCapturedPattern(captured, pattern.checksum);
    if (!result.ok) throw new Error("optical failed");
  });
  rows.push({
    op: "optical project + capture",
    samples: 5,
    ...stats(opticalTimes),
    note: "screen-light key channel",
  });

  return rows;
}

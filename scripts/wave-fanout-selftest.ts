/**
 * Wave fan-out (SPATIAL S4) — event-driven hits after tip illuminate;
 * acceptBlock still recomputes waveDigest (no second truth).
 * bun run test:wave-fanout
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  acceptBlock,
  assertWaveDigestMatch,
  computeTipWaveField,
  createGenesis,
  createLightProof,
  createWaveBus,
  generateLightKeypair,
  proposeTransfer,
  sequenceBlock,
  stateFromPixels,
  waveFanoutFromPixel,
  waveFanoutThesis,
  type LedgerPixel,
  type WaveFanoutEvent,
} from "../src/lib/pixel";
import { PixelLedgerNode } from "../src/node/node";

const BASE = `/tmp/pixel-wave-fanout-${process.pid}`;

async function waitForFanout(
  subscribe: (cb: (ev: WaveFanoutEvent) => void) => () => void,
  timeoutMs = 5_000,
): Promise<WaveFanoutEvent> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      unsub();
      reject(new Error("fan-out timeout"));
    }, timeoutMs);
    const unsub = subscribe((ev) => {
      clearTimeout(t);
      unsub();
      resolve(ev);
    });
  });
}

async function main() {
  console.log("═══ WAVE FAN-OUT (S4) ═══\n");

  if (!waveFanoutThesis().includes("second consensus truth")) throw new Error("thesis");
  if (!/tip-recomputable/i.test(waveFanoutThesis())) throw new Error("thesis invent");
  console.log("▸ thesis ✓");

  // Unit: bus is async and non-blocking
  const bus = createWaveBus();
  let heard = 0;
  bus.on(() => {
    heard++;
  });
  bus.emit(
    waveFanoutFromPixel(
      {
        index: 0,
        hash: "aa".repeat(64),
        wave: [{ cellIndex: 0, hop: 0, amplitudeMilli: 1000, leadIndex: 0 }],
        lightProof: { waveDigest: "bb".repeat(64) },
      },
      "sequence",
    ),
  );
  if (heard !== 0) throw new Error("emit must not sync-call listeners");
  await Promise.resolve();
  await Promise.resolve();
  if (heard !== 1) throw new Error(`expected 1 async delivery, got ${heard}`);
  if (!bus.last() || bus.last()!.source !== "sequence") throw new Error("last()");
  console.log("▸ bus async fan-out ✓");

  // Tip path: sequenceBlock still sole truth for digest
  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  let chain = await createGenesis(alice);
  const { state: pending } = await proposeTransfer(
    chain,
    alice,
    [{ amount: 1, address: bob.address }],
    { description: "fanout grow", recipientLabel: "@bob" },
  );
  chain = await sequenceBlock(pending, alice);
  const tip = chain.pixels[chain.pixels.length - 1]!;
  const expected = computeTipWaveField({
    tipIndex: tip.index,
    sequence: tip.sequence,
    prevHash: tip.prevHash,
    merkleRoot: tip.merkleRoot,
    priorTipHashes: chain.pixels.slice(0, -1).map((p) => p.hash),
  });
  if (expected.waveDigest !== tip.lightProof.waveDigest) throw new Error("waveDigest drift");
  assertWaveDigestMatch(tip.lightProof.waveDigest, {
    tipIndex: tip.index,
    sequence: tip.sequence,
    prevHash: tip.prevHash,
    merkleRoot: tip.merkleRoot,
    priorTipHashes: chain.pixels.slice(0, -1).map((p) => p.hash),
  });
  console.log("▸ tip waveDigest still tip-recomputable ✓");

  // Node: illuminate fans out matching tip hits
  await rm(BASE, { recursive: true, force: true });
  await mkdir(BASE, { recursive: true });
  const node = new PixelLedgerNode({
    datadir: join(BASE, "node"),
    rpcPort: 19_500 + (process.pid % 400),
    gossipPort: 0,
    autoSequenceMs: 0,
    stallCheckMs: 0,
  });
  await node.start();
  try {
    const pendingFanout = waitForFanout((cb) => node.onWaveHits(cb));
    await node.send(node.keypair, [{ address: bob.address, amount: 3 }], {
      description: "node fanout illuminate",
      recipientLabel: "@bob",
    });
    const ev = await pendingFanout;
    if (ev.source !== "sequence") throw new Error(`source ${ev.source}`);
    const nodeTip = node.chain.pixels[node.chain.pixels.length - 1]!;
    if (ev.tipIndex !== nodeTip.index) throw new Error("tipIndex");
    if (ev.waveDigest !== nodeTip.lightProof.waveDigest) throw new Error("digest mismatch");
    if (ev.hits.length !== (nodeTip.wave?.length ?? 0)) throw new Error("hits length");
    console.log("▸ node sequence fan-out ✓ tip", ev.tipIndex, "hits", ev.hits.length);

    // Bus forgery cannot rewrite accept — forged digest still rejected
    const peer = stateFromPixels(
      node.chain.pixels.slice(0, nodeTip.index),
      node.chain.sequencers,
      node.chain.networkId,
    );
    const forgedWave = computeTipWaveField({
      tipIndex: 0,
      sequence: 0,
      prevHash: "00".repeat(64),
      merkleRoot: "11".repeat(64),
      priorTipHashes: [],
    }).waveDigest;
    if (forgedWave === nodeTip.lightProof.waveDigest) throw new Error("forge collided");
    // Poison the local bus with forged hits — notify plane only
    node.waveBus.emit({
      ...waveFanoutFromPixel(nodeTip, "sequence"),
      waveDigest: forgedWave,
      hits: [{ cellIndex: 99, hop: 0, amplitudeMilli: 1, leadIndex: 0 }],
    });
    const forgedProof = await createLightProof({
      sequence: nodeTip.sequence,
      prevHash: nodeTip.prevHash,
      sequencer: node.keypair,
      skipCount: nodeTip.lightProof.skipCount ?? 0,
      electable: nodeTip.lightProof.electable,
      fieldDigest: nodeTip.lightProof.fieldDigest,
      waveDigest: forgedWave,
      spatialRoot: nodeTip.lightProof.spatialRoot,
    });
    const forgedTip: LedgerPixel = { ...nodeTip, lightProof: forgedProof };
    let rejected = false;
    try {
      await acceptBlock(peer, forgedTip);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("waveDigest mismatch") && !msg.includes("Invalid PoLS")) {
        throw new Error(`unexpected: ${msg}`);
      }
      rejected = true;
      console.log("▸ forged wave rejected despite bus poison ✓");
    }
    if (!rejected) throw new Error("bus must not become second truth");
  } finally {
    node.stop();
    await Bun.sleep(200);
    await rm(BASE, { recursive: true, force: true }).catch(() => {});
  }

  console.log("\n═══ PASS — wave fan-out S4 ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

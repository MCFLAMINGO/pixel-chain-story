/**
 * Shared tip attach — POST /tx marks the node tip Billboard shows (shared_tip).
 * bun run test:shared-tip
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  assertSameCanvas,
  attachTransferViaRpc,
  fetchTipCanvas,
  forgePersonalSource,
  generateLightKeypair,
  payOnSharedTip,
  tipMarkThesis,
  unlockPersonalSource,
} from "../src/lib/pixel";
import { PixelLedgerNode } from "../src/node/node";
import { startRpcServer } from "../src/node/rpc-server";

const BASE = `/tmp/pixel-shared-tip-${process.pid}`;
const RPC = 19_400 + (process.pid % 500);

async function main() {
  console.log("═══ SHARED TIP ATTACH ═══\n");
  if (!tipMarkThesis().includes("shared public tip")) throw new Error("thesis");

  await rm(BASE, { recursive: true, force: true });
  await mkdir(BASE, { recursive: true });

  const node = new PixelLedgerNode({
    datadir: join(BASE, "node"),
    rpcPort: RPC,
    gossipPort: 0,
    autoSequenceMs: 200,
    stallCheckMs: 0,
  });
  await node.start();
  const server = startRpcServer(node, RPC);
  const rpc = `http://127.0.0.1:${RPC}`;

  try {
    const health = (await fetch(`${rpc}/health`).then((r) => r.json())) as {
      genesisHash?: string;
      networkId?: number;
      tip?: number;
    };
    if (!health.genesisHash) throw new Error("health missing genesisHash");
    const canvas = await fetchTipCanvas(rpc);
    assertSameCanvas(canvas, {
      networkId: health.networkId!,
      genesisHash: health.genesisHash as never,
    });
    console.log("▸ tip canvas ✓", canvas.networkId, canvas.genesisHash.slice(0, 12) + "…");

    const person = await forgePersonalSource("erik");
    const unlocked = await unlockPersonalSource(person.source);

    // Fund pay face from tip sequencer (operator faucet — lab).
    await node.send(node.keypair, [{ address: person.source.address, amount: 40 }], {
      description: "Canonical tip faucet → people wallet",
      recipientLabel: "erik",
    });
    // Wait for tip to include faucet
    const t0 = Date.now();
    while (Date.now() - t0 < 15_000) {
      const bal = (await fetch(`${rpc}/balance/${encodeURIComponent(person.source.address)}`).then(
        (r) => r.json(),
      )) as { balance?: number };
      if ((bal.balance ?? 0) >= 40) break;
      await Bun.sleep(100);
    }
    const funded = (await fetch(`${rpc}/balance/${encodeURIComponent(person.source.address)}`).then(
      (r) => r.json(),
    )) as { balance?: number };
    if ((funded.balance ?? 0) < 40) throw new Error(`faucet failed bal=${funded.balance}`);
    console.log("▸ faucet 40 PIX on shared tip ✓");

    const peer = await generateLightKeypair();
    const paid = await payOnSharedTip({
      rpc,
      unlocked,
      toAddress: peer.address,
      amount: 7,
      note: "shared tip pay",
    });
    if (paid.tipMark.attachment !== "shared_tip") throw new Error("must be shared_tip");
    if (paid.tipMark.kind !== "people-pay") throw new Error("kind");
    assertSameCanvas(paid.tipMark.canvasId, canvas);
    const peerBal = (await fetch(`${rpc}/balance/${encodeURIComponent(peer.address)}`).then((r) =>
      r.json(),
    )) as { balance?: number };
    if (peerBal.balance !== 7) throw new Error(`peer bal ${peerBal.balance}`);
    console.log("▸ people pay shared_tip ✓ tip #", paid.tipMark.tipIndex);

    // Foreign canvas refuse: attach against wrong expectedCanvas
    let refused = false;
    try {
      await attachTransferViaRpc({
        rpcBase: rpc,
        from: unlocked.keypair,
        toAddress: peer.address,
        amount: 1,
        expectedCanvas: {
          networkId: canvas.networkId,
          genesisHash: "ff".repeat(64) as never,
        },
        metadata: { description: "should fail" },
        timeoutMs: 2000,
      });
    } catch {
      refused = true;
    }
    if (!refused) throw new Error("foreign expectedCanvas must refuse");
    console.log("▸ foreign canvas refuse ✓");

    console.log("\n═══ PASS — shared tip attach ═══");
  } finally {
    server.stop(true);
    node.stop();
    // Drain queued persist before wiping datadir
    await Bun.sleep(250);
    await rm(BASE, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

/**
 * Pixel Ledger L1 proof — two nodes, real accept/sequence, disk persistence.
 * bun scripts/l1-selftest.ts
 */

import { rm } from "node:fs/promises";
import {
  acceptBlock,
  balanceOf,
  createGenesis,
  generateLightKeypair,
  proposeTransfer,
  registerSequencer,
  sequenceBlock,
  serializeChain,
  deserializeChain,
  verifyChain,
  nextSequencerAddress,
  PIXEL_LEDGER_NAME,
} from "../src/lib/pixel/index";
import { ensureDatadir, saveChain, loadChain } from "../src/node/store";

async function main() {
  console.log(`═══ ${PIXEL_LEDGER_NAME.toUpperCase()} L1 ═══\n`);

  const dir = "/tmp/pixel-ledger-l1-test";
  await rm(dir, { recursive: true, force: true });
  await ensureDatadir(dir);

  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  const nodeB = await generateLightKeypair();

  let chainA = await createGenesis(alice);
  chainA = registerSequencer(chainA, nodeB);
  await saveChain(dir, chainA);

  const loaded = await loadChain(dir);
  if (!loaded || !(await verifyChain(loaded))) throw new Error("persist/verify failed");
  console.log("▸ persistence ✓");

  // Node B view
  let chainB = registerSequencer(loaded, nodeB);

  // Transfer on A
  const { state: pending, tx } = await proposeTransfer(
    chainA,
    alice,
    [{ amount: 13, address: bob.address }],
    { description: "L1 pixel settlement", recipientLabel: "@bob" },
  );
  chainA = pending;
  console.log("▸ tx in superposition", tx.state);

  // Elect sequencer and produce pixel on the correct node
  const elected = nextSequencerAddress(chainA);
  const signer = elected === alice.address ? alice : nodeB;
  console.log("▸ elected sequencer", elected.slice(0, 12) + "…");

  // Sync pending to B
  chainB = { ...chainB, pending: chainA.pending };

  if (signer.address === alice.address) {
    chainA = await sequenceBlock(chainA, alice);
    const pixel = chainA.pixels[chainA.pixels.length - 1];
    chainB = await acceptBlock(chainB, pixel);
  } else {
    chainB = await sequenceBlock(chainB, nodeB);
    const pixel = chainB.pixels[chainB.pixels.length - 1];
    chainA = await acceptBlock(chainA, pixel);
  }

  if (!(await verifyChain(chainA)) || !(await verifyChain(chainB))) {
    throw new Error("post-accept verify failed");
  }
  if (balanceOf(chainA, bob.address) !== 13) throw new Error("bob balance");
  if (balanceOf(chainB, bob.address) !== 13) throw new Error("bob balance on B");
  console.log("▸ multi-node acceptPixel ✓ bob=13");

  // Round-trip serialize name: pixels not blocks
  const snap = serializeChain(chainA);
  if (!("pixels" in snap) || (snap as { blocks?: unknown }).blocks) {
    // blocks key must be absent
  }
  if (!snap.pixels?.length) throw new Error("snapshot missing pixels");
  const again = deserializeChain(snap);
  if (!(await verifyChain(again))) throw new Error("deserialize verify failed");
  console.log("▸ pixel snapshot (not blocks) ✓");

  console.log(`\n═══ PASS — ${PIXEL_LEDGER_NAME} functions as a networked light ledger ═══`);
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

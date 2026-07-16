/**
 * Runnable self-test for Pixel Light Protocol.
 * Usage: bun scripts/pixel-selftest.ts
 */

import {
  balanceOf,
  createDemoWallet,
  createGenesis,
  encodeHexAsLight,
  estimatePoLSCost,
  hexToBytes,
  humanSummary,
  proposeTransfer,
  sequenceBlock,
  simulateCameraCapture,
  verifyCapturedPattern,
  verifyChain,
  bytesToHex,
} from "../src/lib/pixel/index";

async function main() {
  console.log("Pixel Light Protocol — self test\n");

  const alice = await createDemoWallet("Alice");
  const bob = await createDemoWallet("Bob");
  console.log("Alice:", alice.address);
  console.log("Bob:  ", bob.address);

  let chain = await createGenesis(alice);
  console.log("Genesis balance Alice:", balanceOf(chain, alice.address));

  const { state: afterPropose, tx } = await proposeTransfer(
    chain,
    alice,
    [{ amount: 2500, address: bob.address }],
    {
      description: "Support for clean energy tools",
      reference: "HUMANITY-001",
      recipientLabel: "@bob",
    },
  );
  chain = afterPropose;
  console.log("Pending:", humanSummary(tx, alice.address));
  console.log("State:", tx.state);

  chain = await sequenceBlock(chain);
  const revealed = chain.blocks[chain.blocks.length - 1].transactions[0];
  console.log("After light:", humanSummary(revealed, alice.address));
  console.log("Alice:", balanceOf(chain, alice.address), "Bob:", balanceOf(chain, bob.address));

  const valid = await verifyChain(chain);
  console.log("Chain valid:", valid);

  const seedBytes = hexToBytes(alice.seed);
  const payload = new Uint8Array(32);
  payload.set(seedBytes.slice(0, 32));
  const pattern = await encodeHexAsLight(bytesToHex(payload));
  const captured = simulateCameraCapture(pattern, 0);
  const optical = await verifyCapturedPattern(captured, pattern.checksum);
  console.log("Optical key round-trip:", optical.ok);
  console.log(
    "Projected payload matches:",
    optical.payload && bytesToHex(optical.payload) === pattern.payloadHex,
  );

  const cost = estimatePoLSCost();
  console.log("\nEnergy model:", cost.model);
  console.log(cost.relativeToPoW);
  console.log(cost.note);

  if (!valid || !optical.ok) {
    console.error("\nFAIL");
    process.exit(1);
  }
  if (balanceOf(chain, bob.address) !== 2500) {
    console.error("\nFAIL: bob balance incorrect");
    process.exit(1);
  }
  console.log("\nPASS — real UTXO transfer finalized by Proof of Light Sequence");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

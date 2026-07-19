/**
 * Lab leader lottery — deterministic, public-input verifiable (not VRF/BFT).
 * Also proves electable binding survives registry growth (join).
 * bun scripts/election-selftest.ts
 */
import {
  acceptBlock,
  createGenesis,
  deserializeChain,
  generateLightKeypair,
  nextSequencerAddress,
  proposeTransfer,
  registerSequencer,
  selectSequencer,
  selectSequencerWithSkip,
  sequenceBlock,
  serializeChain,
  verifyChain,
  type Hex,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ LEADER LOTTERY (LAB) ═══\n");

  const addrs = [
    "pix1aaa00000000000000000000000000000001",
    "pix1bbb00000000000000000000000000000002",
    "pix1ccc00000000000000000000000000000003",
    "pix1ddd00000000000000000000000000000004",
  ];
  const prev = "ab".repeat(64) as Hex;

  const a = selectSequencer(prev, 1, addrs);
  const b = selectSequencer(prev, 1, addrs);
  if (a !== b) throw new Error("lottery not deterministic");
  console.log("▸ deterministic ✓ elected", a.slice(0, 12) + "…");

  const c = selectSequencer(prev, 2, addrs);
  console.log("▸ sequence=2 elected", c.slice(0, 12) + "…");

  const skip1 = selectSequencerWithSkip(prev, 1, addrs, 1);
  if (skip1 === a) throw new Error("skip=1 should rotate away from base");
  console.log("▸ skip rotation ✓", skip1.slice(0, 12) + "…");

  const winners = new Set<string>();
  for (let s = 0; s < 64; s++) {
    winners.add(selectSequencer(prev, s, addrs));
  }
  if (winners.size < 2) throw new Error("lottery collapsed to one address");
  console.log(
    "▸ diversity across sequences ✓",
    winners.size,
    "of",
    addrs.length,
    "win in 64 draws",
  );

  // Join must not rewrite genesis lottery; new sequencers may still produce.
  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  const nodeB = await generateLightKeypair();
  let chain = await createGenesis(alice);
  if (!(await verifyChain(chain))) throw new Error("genesis verify");
  chain = registerSequencer(chain, nodeB);
  if (!(await verifyChain(chain))) throw new Error("join rewrote genesis lottery");
  console.log("▸ join preserves genesis verify ✓");

  const { state: pending } = await proposeTransfer(
    chain,
    alice,
    [{ amount: 3, address: bob.address }],
    { description: "election electable bind", recipientLabel: "@bob" },
  );
  chain = pending;
  const peerBase = deserializeChain(serializeChain(chain));
  const elected = nextSequencerAddress(chain);
  const signer = elected === alice.address ? alice : nodeB;
  chain = await sequenceBlock(chain, signer);
  const tip = chain.pixels[chain.pixels.length - 1];
  if (
    !tip.lightProof.electable?.includes(alice.address) ||
    !tip.lightProof.electable?.includes(nodeB.address)
  ) {
    throw new Error("tip missing bound electable registry");
  }
  // Grow registry after tip — history still verifies.
  const nodeC = await generateLightKeypair();
  chain = registerSequencer(chain, nodeC);
  if (!(await verifyChain(chain))) throw new Error("registry growth rewrote tip lottery");
  console.log("▸ electable binding survives registry growth ✓");

  const peer = await acceptBlock(peerBase, tip);
  if (!(await verifyChain(peer))) throw new Error("peer accept verify failed");
  console.log("▸ peer accept with bound electable ✓");

  console.log("\n═══ PASS — lab lottery (not VRF/BFT) ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

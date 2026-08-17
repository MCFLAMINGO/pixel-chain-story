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
  noteSequencerKey,
  electableAt,
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

  // Noting a key must not rewrite the genesis lottery, and must not grant a turn.
  //
  // This section used to assert the opposite: that `registerSequencer(chain, nodeB)`
  // made nodeB electable and that a produced tip bound both addresses. That was the
  // defect — gossip deciding who may produce — and it is what let a stranger extend
  // the tip with one ground keypair. Membership is now a fold over records committed
  // in pixels (`membership.ts`), so the assertions are inverted here rather than
  // deleted: same scenario, correct verdict.
  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  const nodeB = await generateLightKeypair();
  let chain = await createGenesis(alice);
  if (!(await verifyChain(chain))) throw new Error("genesis verify");
  chain = noteSequencerKey(chain, nodeB);
  if (!(await verifyChain(chain))) throw new Error("noting a key rewrote genesis lottery");
  if (electableAt(chain, 1).includes(nodeB.address)) {
    throw new Error("noting a key must not confer electability");
  }
  console.log("▸ noting a key preserves genesis verify and grants no turn ✓");

  const { state: pending } = await proposeTransfer(
    chain,
    alice,
    [{ amount: 3, address: bob.address }],
    { description: "election electable bind", recipientLabel: "@bob" },
  );
  chain = pending;
  const peerBase = deserializeChain(serializeChain(chain));
  const elected = nextSequencerAddress(chain);
  if (elected !== alice.address) {
    throw new Error(`only the founder is electable, but the lottery chose ${elected}`);
  }
  chain = await sequenceBlock(chain, alice);
  const tip = chain.pixels[chain.pixels.length - 1];
  const boundSet = tip.lightProof.electable ?? [];
  if (boundSet.length !== 1 || boundSet[0] !== alice.address) {
    throw new Error(`tip must bind exactly the folded set, got ${boundSet.join(",")}`);
  }
  console.log("▸ tip binds exactly the set history folds ✓");

  // Noting more keys after the tip changes nothing, in either direction.
  const nodeC = await generateLightKeypair();
  chain = noteSequencerKey(chain, nodeC);
  if (!(await verifyChain(chain))) throw new Error("noting a key rewrote tip lottery");
  if (electableAt(chain, chain.pixels.length).length !== 1) {
    throw new Error("key table growth widened the electable set");
  }
  console.log("▸ electable binding survives key-table growth ✓");

  const peer = await acceptBlock(peerBase, tip);
  if (!(await verifyChain(peer))) throw new Error("peer accept verify failed");
  console.log("▸ peer accept with bound electable ✓");

  console.log("\n═══ PASS — lab lottery (not VRF/BFT) ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

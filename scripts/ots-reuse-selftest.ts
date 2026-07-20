/**
 * Ledger-level OTS single-use guard — (publicKey, leafIndex) cannot repeat.
 * bun scripts/ots-reuse-selftest.ts
 */
import {
  OtsLeafReuseError,
  createGenesis,
  createTransaction,
  generateLightKeypair,
  hexToBytes,
  parseOtsLeafIndex,
  proposeTransfer,
  restoreLightKeypair,
  sequenceBlock,
  signTransaction,
  verifyChain,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ OTS LEAF REUSE (LEDGER) ═══\n");

  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  const seed = hexToBytes(alice.seed);

  let state = await createGenesis(alice);
  if (state.usedOtsLeaves.size < 1) {
    throw new Error("genesis must record PoLS OTS leaf");
  }
  console.log("▸ genesis recorded", state.usedOtsLeaves.size, "OTS usage(s) ✓");

  // Honest path: sequential leaves (wallet cursor may self-heal past genesis leaf)
  ({ state } = await proposeTransfer(state, alice, [{ amount: 5, address: bob.address }], {
    description: "honest-1",
  }));
  state = await sequenceBlock(state, alice);
  if (!(await verifyChain(state))) throw new Error("honest chain invalid");
  console.log("▸ honest sequential leaves accept ✓");

  // Find a spent alice leaf from the tip (tx or pols)
  let spentLeaf = -1;
  for (const key of state.usedOtsLeaves) {
    if (!key.startsWith(alice.publicKey)) continue;
    spentLeaf = Number(key.split(":")[1]);
    break;
  }
  if (spentLeaf < 0) throw new Error("no spent alice leaf");

  // Craft attack: force-sign with a spent leaf (bypass proposeTransfer self-heal)
  const utxo = [...state.utxos.values()].find((u) => u.address === alice.address);
  if (!utxo) throw new Error("alice has no UTXO");
  const attacker = await restoreLightKeypair(seed, spentLeaf);
  let evil = await createTransaction({
    inputs: [{ txid: utxo.txid, vout: utxo.vout }],
    outputs: [{ amount: 1, address: bob.address }],
    metadata: { description: "reuse-attack" },
  });
  evil = await signTransaction(evil, attacker);
  const leaf = parseOtsLeafIndex(evil.inputs[0]?.signature ?? "");
  if (leaf !== spentLeaf) throw new Error(`forced leaf want ${spentLeaf} got ${leaf}`);

  const poisoned = {
    ...state,
    pending: [...state.pending, evil],
    pendingSince: Date.now(),
  };

  let blocked = false;
  try {
    await sequenceBlock(poisoned, alice);
  } catch (e) {
    blocked = e instanceof OtsLeafReuseError || String(e).includes("OTS_LEAF_REUSED");
  }
  if (!blocked) throw new Error("sequenceBlock accepted reused OTS leaf — guard missing");
  console.log("▸ sequenceBlock rejects crafted reused leaf ✓");

  // Stale wallet self-heal: restore at spent leaf, proposeTransfer skips to fresh leaf
  const stale = await restoreLightKeypair(seed, spentLeaf);
  const before = stale.nextLeaf;
  const { state: healed, tx } = await proposeTransfer(
    state,
    stale,
    [{ amount: 1, address: bob.address }],
    { description: "stale-heal" },
  );
  const healedLeaf = parseOtsLeafIndex(tx.inputs[0]?.signature ?? "");
  if (healedLeaf === null || healedLeaf === spentLeaf || healedLeaf < before) {
    throw new Error(`self-heal failed: spent=${spentLeaf} got=${healedLeaf}`);
  }
  const tip = await sequenceBlock(healed, alice);
  if (!(await verifyChain(tip))) throw new Error("healed chain invalid");
  console.log("▸ stale wallet self-heals past used leaves ✓");

  console.log("\n═══ PASS — ledger OTS single-use enforced ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

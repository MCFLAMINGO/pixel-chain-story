/**
 * Gate C — offline elected sequencer does not freeze the tip forever.
 * bun run test:fault
 */

import {
  acceptBlock,
  balanceOf,
  createGenesis,
  generateLightKeypair,
  nextSequencerAddress,
  POLS_STALL_MS,
  preferPixel,
  proposeTransfer,
  rebuildUsedOtsLeaves,
  registerSequencer,
  sequenceBlock,
  skipCountForAddress,
  verifyChain,
  type PixelChainState,
  type Utxo,
} from "../src/lib/pixel/index";

function utxosFromPixels(pixels: PixelChainState["pixels"]): Map<string, Utxo> {
  const utxos = new Map<string, Utxo>();
  for (const p of pixels) {
    for (const t of p.transactions) {
      for (const inp of t.inputs) utxos.delete(`${inp.txid}:${inp.vout}`);
      t.outputs.forEach((out, vout) => {
        utxos.set(`${t.txid}:${vout}`, {
          txid: t.txid,
          vout,
          amount: out.amount,
          address: out.address,
        });
      });
    }
  }
  return utxos;
}

async function main() {
  console.log("═══ GATE C — PoLS STALL SKIP ═══\n");

  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  const carol = await generateLightKeypair();

  let state = await createGenesis(alice);
  state = registerSequencer(state, bob);

  const { state: pending, tx } = await proposeTransfer(
    state,
    alice,
    [{ amount: 5, address: carol.address }],
    { description: "gate-c fault path", recipientLabel: "@carol" },
  );
  // Stall clock starts at parent tip time so skip tip timestamp stays after parent+STALL
  // (verifyChain historical rule: skip tip ≥ parent.timestamp + POLS_STALL_MS).
  const parentTs = state.pixels[state.pixels.length - 1].timestamp;
  state = { ...pending, pendingSince: parentTs };

  const elected0 = nextSequencerAddress(state, 0);
  console.log("▸ elected skip=0", elected0.slice(0, 14) + "…");

  const standby = elected0 === alice.address ? bob : alice;
  const skip = skipCountForAddress(state, standby.address);
  if (skip === null || skip < 1) {
    throw new Error(`standby should be elected at skip≥1, got ${skip}`);
  }
  console.log(`▸ standby skip=${skip}`, standby.address.slice(0, 14) + "…");

  let earlyFailed = false;
  try {
    await sequenceBlock(state, standby, {
      skipCount: skip,
      now: (state.pendingSince ?? 0) + 100,
    });
  } catch {
    earlyFailed = true;
  }
  if (!earlyFailed) throw new Error("skip before stall window should fail");
  console.log("▸ early skip rejected ✓");

  const now = (state.pendingSince ?? 0) + POLS_STALL_MS + 500;
  const stallSince = state.pendingSince;
  state = await sequenceBlock(state, standby, { skipCount: skip, now });
  const tip = state.pixels[state.pixels.length - 1];
  if ((tip.lightProof.skipCount ?? 0) !== skip) {
    throw new Error(`tip skipCount want ${skip} got ${tip.lightProof.skipCount}`);
  }
  if (balanceOf(state, carol.address) !== 5) throw new Error("carol balance");
  console.log(`▸ skip illuminate pixel #${tip.index} ✓`);

  const parentPixels = state.pixels.slice(0, -1);
  const parentState: PixelChainState = {
    networkId: state.networkId,
    pixels: parentPixels,
    sequencers: state.sequencers,
    providers: state.providers,
    pending: [tx],
    pendingSince: stallSince,
    utxos: utxosFromPixels(parentPixels),
    usedOtsLeaves: rebuildUsedOtsLeaves(parentPixels),
  };
  const accepted = await acceptBlock(parentState, tip);
  if (balanceOf(accepted, carol.address) !== 5) throw new Error("peer accept balance");
  if (!(await verifyChain(state))) throw new Error("verifyChain producer");
  if (!(await verifyChain(accepted))) throw new Error("verifyChain peer");
  console.log("▸ peer acceptBlock of skip tip ✓");

  const better = preferPixel(
    {
      index: 1,
      hash: "b".repeat(128),
      lightProof: { skipCount: 1 } as never,
    },
    {
      index: 1,
      hash: "a".repeat(128),
      lightProof: { skipCount: 0 } as never,
    },
  );
  if ((better.lightProof.skipCount ?? 0) !== 0) throw new Error("prefer lower skip");
  console.log("▸ preferPixel lower skip ✓");

  let fresh = await createGenesis(alice);
  fresh = registerSequencer(fresh, bob);
  const p2 = await proposeTransfer(fresh, alice, [{ amount: 2, address: carol.address }], {
    description: "on-time",
    recipientLabel: "@carol",
  });
  fresh = p2.state;
  const e = nextSequencerAddress(fresh, 0);
  const signer = e === alice.address ? alice : bob;
  fresh = await sequenceBlock(fresh, signer, { skipCount: 0 });
  if ((fresh.pixels.at(-1)?.lightProof.skipCount ?? 0) !== 0) {
    throw new Error("on-time should be skip 0");
  }
  console.log("▸ on-time skip=0 still works ✓");

  console.log("\n═══ PASS — Gate C lab stall skip ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

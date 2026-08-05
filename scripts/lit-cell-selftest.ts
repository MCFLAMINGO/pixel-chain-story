#!/usr/bin/env bun
/**
 * A pixel must be able to say whose moment it was.
 *
 * Today the only name on a pixel is the sequencer's, via the coinbase. These
 * assertions check that authorship is derivable, that the wage and the moment
 * are distinguishable, and that the commitment actually moves when the record
 * changes — otherwise it would be a root that proves nothing.
 */

import {
  authorOf,
  authorsOf,
  litCellDigest,
  litCellsOf,
  litCellThesis,
  momentsOf,
  ownerOfCell,
  pixelAuthorshipRoot,
} from "../src/lib/pixel/lit-cell";
import { createGenesis, proposeTransfer, sequenceBlock } from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  console.log("═══ LIT CELLS — whose moment was it ═══\n");

  const sequencer = await generatePixelKeypair("PIX-ML-DSA-65");
  const dale = await generatePixelKeypair("PIX-ML-DSA-65");
  const joe = await generatePixelKeypair("PIX-ML-DSA-65");

  let state = await createGenesis(sequencer);

  // Genesis: a wage and nothing else. No moment has been lived yet.
  const genesis = state.pixels[0]!;
  const genesisCells = await litCellsOf(genesis);
  assert(genesisCells.length === 1, `genesis should hold one cell, got ${genesisCells.length}`);
  assert(genesisCells[0]!.kind === "light_reward", "genesis cell must be the wage");
  assert(genesisCells[0]!.owner === sequencer.address, "genesis wage belongs to the sequencer");
  assert((await momentsOf(genesis)).length === 0, "genesis carries no moments");
  console.log("▸ genesis is a wage with no author ✓");

  // Fund the two people so they can light moments of their own.
  ({ state } = await proposeTransfer(
    state,
    sequencer,
    [
      { amount: 9, address: dale.address },
      { amount: 9, address: joe.address },
    ],
    { description: "seed two people", reference: "SEED" },
  ));
  state = await sequenceBlock(state, sequencer);

  // Two people each light a moment in the same pixel.
  ({ state } = await proposeTransfer(state, dale, [{ amount: 2, address: joe.address }], {
    description: "coffee at the corner table",
    reference: "MOMENT-DALE",
    recipientLabel: "@joe",
  }));
  ({ state } = await proposeTransfer(state, joe, [{ amount: 1, address: dale.address }], {
    description: "paid him back the next morning",
    reference: "MOMENT-JOE",
    recipientLabel: "@dale",
  }));
  state = await sequenceBlock(state, sequencer);

  const pixel = state.pixels[state.pixels.length - 1]!;
  const cells = await litCellsOf(pixel);
  assert(cells.length === 3, `expected wage + two moments, got ${cells.length}`);
  assert(cells[0]!.kind === "light_reward", "the wage is cell 0");
  assert(cells[0]!.owner === sequencer.address, "wage belongs to the sequencer");

  const moments = await momentsOf(pixel);
  assert(moments.length === 2, `expected two moments, got ${moments.length}`);
  const owners = await authorsOf(pixel);
  assert(owners.includes(dale.address), "dale's moment must be attributed to dale");
  assert(owners.includes(joe.address), "joe's moment must be attributed to joe");
  assert(!owners.includes(sequencer.address), "the sequencer did not live these moments");
  console.log(`▸ pixel #${pixel.index}: 1 wage + ${moments.length} moments, by their authors ✓`);

  for (const cell of moments) {
    console.log(
      `   #${cell.pixelIndex}.${cell.cellIndex}  ${cell.owner.slice(0, 14)}…  "${cell.meaning.description}"`,
    );
  }

  // Position resolves to a person.
  assert((await ownerOfCell(pixel, 0)) === sequencer.address, "cell 0 owner");
  assert((await ownerOfCell(pixel, 9)) === null, "an unlit position has no owner");
  console.log("▸ a position resolves to its owner; unlit positions have none ✓");

  // A coinbase has a payee but no author.
  const coinbase = pixel.transactions[0]!;
  assert((await authorOf(coinbase)) === null, "a coinbase has no author");
  console.log("▸ a wage has a payee, not an author ✓");

  // The commitment must actually bind. If it does not move, it proves nothing.
  const root = await pixelAuthorshipRoot(pixel);
  const reRoot = await pixelAuthorshipRoot(pixel);
  assert(root === reRoot, "root must be deterministic");

  const stolen = { ...moments[0]!, owner: joe.address };
  assert(
    (await litCellDigest(moments[0]!)) !== (await litCellDigest(stolen)),
    "reassigning an owner must change the digest",
  );
  const reworded = {
    ...moments[0]!,
    meaning: { ...moments[0]!.meaning, description: "something else entirely" },
  };
  assert(
    (await litCellDigest(moments[0]!)) !== (await litCellDigest(reworded)),
    "rewriting the meaning must change the digest",
  );
  // Length prefixing: two records that differ only by where a delimiter falls.
  const a = { ...moments[0]!, meaning: { description: "ab", reference: "c" } };
  const b = { ...moments[0]!, meaning: { description: "a", reference: "bc" } };
  assert(
    (await litCellDigest(a)) !== (await litCellDigest(b)),
    "length-prefixing must stop a delimiter shift from colliding",
  );
  console.log("▸ commitment binds owner, meaning, and field boundaries ✓");

  const thesis = litCellThesis();
  console.log(`\nrecords:        ${thesis.records}`);
  console.log(`distinguishes:  ${thesis.distinguishes}`);
  console.log(`NOT committed:  ${thesis.notCommitted}`);

  console.log("\n═══ PASS — a pixel can name whose moment it was ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

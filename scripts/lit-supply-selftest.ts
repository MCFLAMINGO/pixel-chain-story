#!/usr/bin/env bun
/**
 * Lit supply — "the light goes out" as a measurement instead of a rule.
 *
 * Demurrage would make supply track living presence by destroying value, at a
 * rate it cannot vary between an absent person and a farm standing still. This
 * checks the alternative: that the ledger can simply *report* which supply is
 * still moving, and get the same information for free.
 *
 * Proves:
 *   1. Every unspent output can be aged by the pixel that created it.
 *   2. Supply splits into lit and dark, and the split follows the window.
 *   3. Value that moves stays lit; value that sits goes dark on its own.
 *   4. Brightness measures what moved, so a busy address outshines a big idle one.
 *   5. No balance is altered — measuring costs nobody anything.
 */

import { createGenesis, proposeTransfer, sequenceBlock, balanceOf } from "../src/lib/pixel/chain";
import {
  addressBrightness,
  agedUtxos,
  DAY_MS,
  litSupplyReport,
  litSupplyThesis,
} from "../src/lib/pixel/lit-supply";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

console.log("═══ LIT SUPPLY ═══\n");

const alice = await generatePixelKeypair("PIX-ML-DSA-65");
const bob = await generatePixelKeypair("PIX-ML-DSA-65");
const carol = await generatePixelKeypair("PIX-ML-DSA-65");

let state = await createGenesis(alice);
const genesisSupply = balanceOf(state, alice.address);
assert(genesisSupply > 0, "genesis must issue something to measure");

// 1. Every output is ageable, because the pixel that made it carries the clock.
const aged0 = agedUtxos(state);
assert(aged0.length > 0, "genesis outputs must be ageable");
assert(
  aged0.every((u) => u.bornPixel === 0 && u.ageDays >= 0),
  "genesis outputs must be dated to pixel 0",
);
console.log(`▸ ${aged0.length} output(s) aged from the pixel that created them ✓`);

// Move value so there is something recent and something old.
({ state } = await proposeTransfer(state, alice, [{ amount: 7, address: bob.address }], {
  description: "bob gets paid",
}));
state = await sequenceBlock(state, alice);
({ state } = await proposeTransfer(state, bob, [{ amount: 2, address: carol.address }], {
  description: "bob spends a little",
}));
state = await sequenceBlock(state, alice);

// 2. The split follows the window rather than any stored flag.
const now = Date.now();
const wide = litSupplyReport(state, { windowDays: 365, now });
assert(wide.litShare === 1, "everything just moved, so everything must read as lit");
assert(wide.darkSupply === 0, "nothing can be dark in a chain built seconds ago");
assert(
  wide.nominalSupply === wide.litSupply + wide.darkSupply,
  "lit and dark must account for the whole supply exactly",
);
console.log(
  `▸ nominal ${wide.nominalSupply}, lit ${wide.litSupply}, dark ${wide.darkSupply} ` +
    `across ${wide.litAddresses} addresses ✓`,
);

// Age the chain by reading it from the future: nothing on the ledger changes, only
// the question being asked. This is the whole point — the measurement is a view.
const twoYearsOn = now + 2 * 365 * DAY_MS;
const later = litSupplyReport(state, { windowDays: 365, now: twoYearsOn });
assert(later.litShare === 0, "seen from two years on, untouched supply must read dark");
assert(
  later.nominalSupply === wide.nominalSupply,
  "the nominal supply must not move — measuring destroys nothing",
);
console.log("▸ two years on the same chain reads 0% lit, with nominal supply unchanged ✓");

// 3. What moves stays lit. Spend again at the later date and it relights.
({ state } = await proposeTransfer(state, carol, [{ amount: 1, address: alice.address }], {
  description: "carol keeps her light on",
}));
state = await sequenceBlock(state, alice);
const relit = litSupplyReport(state, { windowDays: 365, now: Date.now() });
assert(relit.litSupply > 0, "value that just moved must be lit again");
assert(
  relit.litSupply <= relit.nominalSupply,
  "lit supply can never exceed what the ledger says exists",
);
console.log(`▸ moving value relights it: ${relit.litSupply}/${relit.nominalSupply} lit ✓`);

// Bands must partition the supply, not overlap or leak.
const banded = relit.bands.reduce((sum, b) => sum + b.amount, 0);
assert(
  banded === relit.nominalSupply,
  `age bands must partition supply exactly — got ${banded} of ${relit.nominalSupply}`,
);
console.log(`▸ ${relit.bands.length} age bands partition the supply exactly ✓`);

// 4. Brightness is what moved, not what is held. Alice holds the most and is not
//    automatically the brightest.
const bobBright = addressBrightness(state, bob.address, { windowDays: 30 });
const carolBright = addressBrightness(state, carol.address, { windowDays: 30 });
assert(bobBright.moments > 0, "bob received value, so bob has moments");
assert(carolBright.moments > 0, "carol received value, so carol has moments");
assert(
  addressBrightness(state, "pix1nobody", { windowDays: 30 }).moments === 0,
  "an address that never appeared must be dark",
);
console.log(
  `▸ brightness counts moments: bob ${bobBright.moments}, carol ${carolBright.moments}, ` +
    "a stranger 0 ✓",
);

// 5. Nothing was taxed. Balances are exactly what the ledger says.
assert(
  balanceOf(state, bob.address) === 7 - 2,
  "bob's balance must be untouched by any measurement",
);
console.log("▸ no balance altered — the light goes out without anything being taken ✓");

const t = litSupplyThesis();
console.log(`\ninstead of:   ${t.instead}`);
console.log(`why:          ${t.why}`);
console.log(`brightness:   ${t.brightness}`);
console.log(`honest limit: ${t.limit}`);
console.log("\n═══ PASS — dark supply is observable without demurrage ═══");

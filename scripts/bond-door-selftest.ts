#!/usr/bin/env bun
/**
 * Hybrid bond door — invitation when healthy; PIX bond when the set would die.
 *
 * Never on crowned 20553. On HYBRID_BOND_NETWORK_ID:
 *   - door closed while electable ≥ K
 *   - door opens after vacancy ≥ T (chain time)
 *   - bond join without invitation, with lock payment
 *   - invitation still works
 *   - PoW / Credits seats do not exist
 */

import {
  acceptBlock,
  createGenesis,
  proposeTransfer,
  sequenceBlock,
  verifyChain,
  type PixelChainState,
} from "../src/lib/pixel/chain";
import { CROWNED_NETWORK_ID } from "../src/lib/pixel/crowned-genesis";
import { generatePixelKeypair, signPixel } from "../src/lib/pixel/scheme";
import {
  BOND_DOOR_K,
  BOND_DOOR_T_MS,
  BOND_FLOOR_PIX,
  BOND_LOCK_ADDRESS,
  HYBRID_BOND_NETWORK_ID,
  bondDoorAt,
  bondDoorThesis,
  hybridBondDoorEnabled,
} from "../src/lib/pixel/membership-bond";
import {
  MEMBERSHIP_ACTIVATION_DELAY,
  createSequencerBondJoin,
  createSequencerJoin,
  membersAt,
} from "../src/lib/pixel/membership";

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

console.log("═══ HYBRID BOND DOOR ═══\n");

const thesis = bondDoorThesis();
check(thesis.network === HYBRID_BOND_NETWORK_ID, "thesis pins hybrid network id");
check(!hybridBondDoorEnabled(CROWNED_NETWORK_ID), "crowned Earth cannot open the door");
check(hybridBondDoorEnabled(HYBRID_BOND_NETWORK_ID), "hybrid network enables the door");
check(thesis.refusals.some((r) => /PoW/i.test(r)), "thesis refuses PoW seats");
check(thesis.refusals.some((r) => /Credits/i.test(r)), "thesis refuses Credits seats");

const founder = await generatePixelKeypair("PIX-ML-DSA-65");
const joiner = await generatePixelKeypair("PIX-ML-DSA-65");
const now = Date.now();
const genesisTs = now - BOND_DOOR_T_MS - 5_000;

let chain = await createGenesis(founder, HYBRID_BOND_NETWORK_ID, { now: genesisTs });
check(chain.networkId === HYBRID_BOND_NETWORK_ID, "genesis on hybrid-bond network");
check(
  membersAt({
    founder: founder.address,
    height: 0,
    recordsAt: () => undefined,
  }).length === 1,
  "only founder electable at genesis",
);

{
  const door = bondDoorAt({
    networkId: chain.networkId,
    founder: founder.address,
    height: 1,
    recordsAt: (i) => chain.pixels[i]?.membership,
    timestampAt: (i) => chain.pixels[i]?.timestamp ?? 0,
    atTimestamp: now,
  });
  check(door.open, `door open after vacancy ≥ T (${door.reason})`);
  check(door.electableCount < BOND_DOOR_K, "door open because count < K");
}

// Fund joiner so they can lock the bond (founder earns 50/pixel — fund after a few).
for (let i = 0; i < 2; i++) {
  const { state } = await proposeTransfer(
    chain,
    founder,
    [{ address: joiner.address, amount: 30 }],
    { description: `fund bond joiner ${i}` },
  );
  chain = await sequenceBlock(state, founder, { now: now - 3_000 + i });
}

// Bond lock payment + bond join in one pixel.
{
  const includedAt = chain.pixels.length;
  const { state: funded } = await proposeTransfer(
    chain,
    joiner,
    [{ address: BOND_LOCK_ADDRESS, amount: BOND_FLOOR_PIX }],
    { description: "sequencer bond lock" },
  );
  const record = await createSequencerBondJoin({
    joiner: {
      address: joiner.address,
      publicKey: joiner.publicKey,
      scheme: "PIX-ML-DSA-65",
    },
    includedAt,
    bondUnits: BOND_FLOOR_PIX,
    sign: (msg) => signPixel(msg, joiner),
  });
  chain = await sequenceBlock(funded, founder, {
    now: now - 1_000,
    membership: [record],
  });
  check(
    (chain.pixels[chain.pixels.length - 1]!.membership ?? []).some(
      (r) => r.kind === "sequencer-bond-join",
    ),
    "bond join committed in pixel",
  );
}

// After bond at H, joiner activates for height H+DELAY. Produce DELAY-1 pixels with
// founder still the sole electable producer.
for (let i = 0; i < MEMBERSHIP_ACTIVATION_DELAY - 1; i++) {
  const { state } = await proposeTransfer(
    chain,
    founder,
    [{ address: founder.address, amount: 1 }],
    { description: `delay ${i}` },
  );
  chain = await sequenceBlock(state, founder, { now: now - 500 + i });
}

{
  const nextHeight = chain.pixels.length;
  const set = membersAt({
    founder: founder.address,
    height: nextHeight,
    recordsAt: (i) => chain.pixels[i]?.membership,
  });
  check(set.includes(joiner.address), "joiner electable after activation delay");
  check(set.includes(founder.address), "founder remains electable");
  check(set.length === 2, "electable set size is 2");
}

check(await verifyChain(chain), "bond path chain verifies end-to-end");

// Invitation still works — produce with whichever key the lottery elects.
{
  const door = bondDoorAt({
    networkId: chain.networkId,
    founder: founder.address,
    height: chain.pixels.length,
    recordsAt: (i) => chain.pixels[i]?.membership,
    timestampAt: (i) => chain.pixels[i]?.timestamp ?? 0,
    atTimestamp: now + 200,
  });
  check(!door.open, "door closes once electable ≥ K");

  const third = await generatePixelKeypair("PIX-ML-DSA-65");
  const includedAt = chain.pixels.length;
  const invite = await createSequencerJoin({
    joiner: {
      address: third.address,
      publicKey: third.publicKey,
      scheme: "PIX-ML-DSA-65",
    },
    authorizer: { address: founder.address },
    includedAt,
    sign: async (msg, who) => signPixel(msg, who === "joiner" ? third : founder),
  });
  const { selectSequencer } = await import("../src/lib/pixel/pol");
  const { state } = await proposeTransfer(
    chain,
    founder,
    [{ address: third.address, amount: 1 }],
    { description: "invite path still works" },
  );
  const tip = state.pixels[state.pixels.length - 1]!;
  const electable = membersAt({
    founder: founder.address,
    height: state.pixels.length,
    recordsAt: (i) => state.pixels[i]?.membership,
  });
  const chosen = selectSequencer(tip.hash, tip.sequence + 1, electable);
  const producer = chosen === founder.address ? founder : joiner;
  chain = await sequenceBlock(state, producer, { now: now + 100, membership: [invite] });
  check(
    (chain.pixels[chain.pixels.length - 1]!.membership ?? [])[0]?.kind === "sequencer-join",
    "invitation join still commits when door is closed",
  );
}

// Bond join refused on crowned network id.
{
  const crownedFounder = await generatePixelKeypair("PIX-ML-DSA-65");
  let crowned = await createGenesis(crownedFounder, CROWNED_NETWORK_ID, {
    now: now - BOND_DOOR_T_MS - 5_000,
  });
  // Force a pending tip advance so we can try to sneak a bond join.
  const stranger = await generatePixelKeypair("PIX-ML-DSA-65");
  const { state } = await proposeTransfer(
    crowned,
    crownedFounder,
    [{ address: stranger.address, amount: BOND_FLOOR_PIX }],
    { description: "fund" },
  );
  crowned = await sequenceBlock(state, crownedFounder, { now: now - 1_000 });
  const { state: lockState } = await proposeTransfer(
    crowned,
    stranger,
    [{ address: BOND_LOCK_ADDRESS, amount: BOND_FLOOR_PIX }],
    { description: "fake bond" },
  );
  // Stranger has no coins signed — they need key. We funded stranger but stranger
  // can't sign without being the wallet. Use founder lock attempt wrongly:
  const bad = await createSequencerBondJoin({
    joiner: {
      address: crownedFounder.address,
      publicKey: crownedFounder.publicKey,
      scheme: "PIX-ML-DSA-65",
    },
    includedAt: crowned.pixels.length,
    bondUnits: BOND_FLOOR_PIX,
    sign: (msg) => signPixel(msg, crownedFounder),
  });
  // Fund lock from founder on crowned:
  const { state: lock2 } = await proposeTransfer(
    crowned,
    crownedFounder,
    [{ address: BOND_LOCK_ADDRESS, amount: BOND_FLOOR_PIX }],
    { description: "crowned bond attempt" },
  );
  let refused = false;
  try {
    await sequenceBlock(lock2, crownedFounder, {
      now,
      membership: [bad],
    });
  } catch (e) {
    refused = /invitation-only|bond door|refused/i.test(String(e));
  }
  check(refused, "bond join refused on crowned network");
  void lockState;
}

// Second bond in same vacancy refused (already claimed).
{
  const f = await generatePixelKeypair("PIX-ML-DSA-65");
  const j1 = await generatePixelKeypair("PIX-ML-DSA-65");
  const j2 = await generatePixelKeypair("PIX-ML-DSA-65");
  let c = await createGenesis(f, HYBRID_BOND_NETWORK_ID, { now: genesisTs });
  // Earn enough coinbase to fund both joiners.
  for (let i = 0; i < 3; i++) {
    const { state } = await proposeTransfer(
      c,
      f,
      [{ address: f.address, amount: 1 }],
      { description: `earn ${i}` },
    );
    c = await sequenceBlock(state, f, { now: now - 4_000 + i });
  }
  for (const j of [j1, j2]) {
    const { state } = await proposeTransfer(
      c,
      f,
      [{ address: j.address, amount: BOND_FLOOR_PIX + 5 }],
      { description: "fund" },
    );
    c = await sequenceBlock(state, f, { now: now - 3_000 });
  }
  const { state: s1 } = await proposeTransfer(
    c,
    j1,
    [{ address: BOND_LOCK_ADDRESS, amount: BOND_FLOOR_PIX }],
    { description: "bond1" },
  );
  const r1 = await createSequencerBondJoin({
    joiner: { address: j1.address, publicKey: j1.publicKey, scheme: "PIX-ML-DSA-65" },
    includedAt: c.pixels.length,
    bondUnits: BOND_FLOOR_PIX,
    sign: (msg) => signPixel(msg, j1),
  });
  c = await sequenceBlock(s1, f, { now: now - 2_000, membership: [r1] });

  const { state: s2 } = await proposeTransfer(
    c,
    j2,
    [{ address: BOND_LOCK_ADDRESS, amount: BOND_FLOOR_PIX }],
    { description: "bond2" },
  );
  const r2 = await createSequencerBondJoin({
    joiner: { address: j2.address, publicKey: j2.publicKey, scheme: "PIX-ML-DSA-65" },
    includedAt: c.pixels.length,
    bondUnits: BOND_FLOOR_PIX,
    sign: (msg) => signPixel(msg, j2),
  });
  let secondRefused = false;
  try {
    await sequenceBlock(s2, f, { now: now - 1_000, membership: [r2] });
  } catch (e) {
    secondRefused = /already claimed|bond door is not open/i.test(String(e));
  }
  check(secondRefused, "second bond claim in same vacancy refused");
}

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} ═══`);
  process.exit(1);
}
console.log("═══ PASS — hybrid bond door; crowned stays invitation-only ═══");

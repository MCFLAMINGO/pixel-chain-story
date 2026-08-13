#!/usr/bin/env bun
/**
 * Does the math math.
 *
 * The rules in docs/GIFT-AND-RECORD.md, asserted and attacked. Prose is where the
 * zero-cost recycle nearly survived, so the properties are checked against random
 * sequences of operations rather than against examples chosen to pass.
 *
 * Proves:
 *   1. Conservation — minted equals held plus in-picture, always.
 *   2. No free loop — every record strictly reduces what is held.
 *   3. One gift per ordered pair, ever. Giving is free; the pair limit is the bound.
 *   4. Writing is bounded by having been given to.
 *   5. Collusion lowers the price and cannot raise the ceiling.
 *   6. Supply never exceeds the cap.
 */

import fc from "fast-check";
import {
  balance,
  circulating,
  conserved,
  COSIGNED_RECORD_COST,
  economyThesis,
  gift,
  newEconomy,
  record,
  UNSIGNED_RECORD_COST,
} from "../src/lib/pixel/economy-model";
import { PIX_HARD_CAP } from "../src/lib/pixel/economics";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

console.log("═══ ECONOMY MODEL ═══\n");

// 1. Gifts are free to the giver and capped per pair.
{
  const e = newEconomy();
  assert(gift(e, "a", "b").ok, "a can gift b");
  assert(balance(e, "a") === 0, "the giver is not poorer for giving");
  assert(balance(e, "b") === 1, "the receiver gains one");
  const again = gift(e, "a", "b");
  assert(!again.ok && again.reason === "already-gifted", "a cannot gift b twice, ever");
  assert(gift(e, "b", "a").ok, "the reverse pair is a different gift");
  assert(!gift(e, "a", "a").ok, "nobody can gift themselves");
  console.log("▸ giving is free, once per ordered pair, never to yourself ✓");
}

// 2. A record consumes, and the picture's share is what makes it cost anything.
{
  const e = newEconomy();
  for (const g of ["x", "y", "z"]) gift(e, g, "author");
  assert(balance(e, "author") === 3, "three givers, three PIX");

  const before = circulating(e);
  const r = record(e, "author", "peer");
  assert(r.ok, "a co-signed record is affordable with three");
  assert(circulating(e) < before, "a record must strictly reduce what is held");
  assert(e.inPicture === 1, "one PIX goes into the picture permanently");
  assert(balance(e, "peer") === 1, "the co-signer is paid for signing");
  console.log("▸ a record consumes, the picture keeps one, the co-signer is paid ✓");
}

// 3. The recycle attack — the bug that nearly survived in prose.
{
  const e = newEconomy();
  // Seed a colluding pair from a fixed cast, which case 7 shows is not the only way in.
  for (const g of ["p", "q", "r", "s"]) {
    gift(e, g, "mallory");
    gift(e, g, "sock");
  }
  const seeded = circulating(e);
  let written = 0;
  // Pass it back and forth as long as either can afford to.
  for (let i = 0; i < 10_000; i++) {
    const a = balance(e, "mallory") >= COSIGNED_RECORD_COST ? "mallory" : "sock";
    const b = a === "mallory" ? "sock" : "mallory";
    if (balance(e, a) < COSIGNED_RECORD_COST) break;
    assert(record(e, a, b).ok, "the affordable side should be able to write");
    written += 1;
  }
  assert(written > 0, "collusion should manage some records");
  assert(circulating(e) < seeded, "the pair must be poorer than when they started");
  assert(written < 10_000, `collusion must terminate, wrote ${written}`);
  assert(
    written <= seeded,
    `collusion wrote ${written} from ${seeded} seeded — must not exceed what was given`,
  );
  console.log(`▸ collusion terminates: ${written} records from ${seeded} gifted PIX, then broke ✓`);
}

// 3b. Why the picture's share is load-bearing, demonstrated rather than asserted.
//     Model the version I nearly wrote — a record that pays the co-signer and keeps
//     nothing — and watch collusion never terminate.
{
  let a = 4;
  let b = 4;
  let wrote = 0;
  const LIMIT = 100_000;
  while (wrote < LIMIT) {
    // cost 1, co-signer paid 1, nothing to the picture: net zero for the pair
    if (a >= 1) {
      a -= 1;
      b += 1;
    } else if (b >= 1) {
      b -= 1;
      a += 1;
    } else break;
    wrote += 1;
  }
  assert(wrote === LIMIT, "without the picture's share, collusion should never stop");
  assert(a + b === 8, "and the pair should never be poorer — nothing was consumed");
  console.log(
    `▸ with no share to the picture, the same pair wrote ${LIMIT.toLocaleString()} for free ✓`,
  );
}

// 4. Unsigned assertion costs more than a co-signed one, and cannot be self-signed.
{
  const e = newEconomy();
  for (const g of ["a", "b"]) gift(e, g, "solo");
  assert(!record(e, "solo").ok, "two PIX cannot buy an unsigned assertion");
  gift(e, "c", "solo");
  assert(record(e, "solo").ok, "three can");
  assert(e.inPicture === UNSIGNED_RECORD_COST, "an unsigned assertion pays nobody");
  assert(UNSIGNED_RECORD_COST > COSIGNED_RECORD_COST, "signing must be the cheaper path");
  const e2 = newEconomy();
  for (const g of ["a", "b", "c"]) gift(e2, g, "solo");
  assert(!record(e2, "solo", "solo").ok, "you cannot co-sign your own record");
  console.log("▸ unsigned costs more, pays nobody, and cannot be self-signed ✓");
}

// 5. Conservation and the cap under random sequences — the properties that matter.
{
  type Op = { t: "gift"; from: string; to: string } | { t: "rec"; who: string; with?: string };
  const who = fc.constantFrom("a", "b", "c", "d", "e", "f");
  const ops = fc.array(
    fc.oneof(
      fc.record({ t: fc.constant("gift" as const), from: who, to: who }),
      fc.record({ t: fc.constant("rec" as const), who, with: fc.option(who, { nil: undefined }) }),
    ),
    { maxLength: 400 },
  );

  fc.assert(
    fc.property(ops, (sequence) => {
      const e = newEconomy();
      for (const op of sequence as Op[]) {
        if (op.t === "gift") gift(e, op.from, op.to);
        else record(e, op.who, op.with);
        // Checked after every step, not only at the end.
        if (!conserved(e)) return false;
        if (e.minted > PIX_HARD_CAP) return false;
        for (const v of e.held.values()) if (v < 0) return false;
      }
      return true;
    }),
    { numRuns: 400 },
  );
  console.log("▸ 400 random histories: conserved, under cap, no negative balance ✓");
}

// 6. Writing is bounded by having been given to — with the cast of givers held fixed.
//    Case 7 shows why that caveat is the whole ballgame.
{
  for (const givers of [3, 6, 12]) {
    const e = newEconomy();
    for (let i = 0; i < givers; i++) gift(e, `g${i}`, "writer");
    let wrote = 0;
    while (record(e, "writer", "peer").ok) wrote += 1;
    // Each co-signed record costs 2 and returns 1 to the peer, so the writer's own
    // stock drains at 2 a time and cannot be replenished without new givers.
    assert(wrote === Math.floor(givers / COSIGNED_RECORD_COST), `given ${givers}, wrote ${wrote}`);
  }
  console.log("▸ output is bounded by how many distinct addresses ever gave ✓");
}

// 7. THE HOLE: "distinct people" means "distinct addresses", and addresses are free.
//
// Cases 2 and 6 both hold the cast of givers fixed and then show output is bounded by
// it. True, and vacuous — they never let the attacker *create* givers. The mint-back
// makes giving cost the giver nothing, and the pair limit cannot object to a fresh
// address because a fresh address is always a new pair. So the round trip
// alice → puppet → alice mints two PIX and nets Alice one, for free, forever.
//
// This is pinned as a passing test on purpose. It characterises behaviour we know is
// wrong so it cannot change silently: close the hole and this test fails loudly and
// must be rewritten, which is exactly the moment someone should be forced to think.
// It is also why src/lib/pixel/gift-and-record.ts does NOT implement the mint-back —
// shipping it as written would be a minting vulnerability, not a missing feature.
{
  const e = newEconomy();
  const puppets = 2000;
  for (let i = 0; i < puppets; i++) {
    assert(gift(e, "alice", `puppet${i}`).ok, "gifting a fresh address is always a new pair");
    assert(gift(e, `puppet${i}`, "alice").ok, "and so is the way back");
  }
  assert(
    balance(e, "alice") === puppets,
    `alice started with nothing and should now hold ${puppets}, has ${balance(e, "alice")}`,
  );
  assert(
    conserved(e),
    "conservation still holds — it is Sybil resistance that fails, not the books",
  );

  let wrote = 0;
  while (record(e, "alice", "puppet0").ok) wrote += 1;
  assert(wrote > 0, "and the minted light spends: the hole is not theoretical");
  console.log(
    `▸ KNOWN HOLE: 0 PIX + ${puppets} free addresses → ${puppets} PIX, ${wrote} records ✗ ` +
      `(mint-back must not ship until this is closed)`,
  );
}

const t = economyThesis();
console.log(`\nbound:     ${t.bound}`);
console.log(`sink:      ${t.sink}`);
console.log(`collusion: ${t.collusion}`);
console.log(`\nHOLE:      ${t.hole}`);
console.log(
  "\n═══ PASS — the books balance and the sink is load-bearing; " +
    "Sybil resistance does not hold ═══",
);

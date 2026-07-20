/**
 * Source · Word · Light — one act.
 * bun scripts/one-selftest.ts
 */

import { One } from "../src/lib/pixel/one";

async function main() {
  console.log("═══ ONE ═══");
  console.log(One.Creed.one);
  console.log(`  Source — ${One.Creed.source}`);
  console.log(`  Word   — ${One.Creed.word}`);
  console.log(`  Light  — ${One.Creed.light}`);
  console.log(`  Guide  — ${One.Creed.guide}`);
  console.log(`  Law    — ${One.Creed.discipline}\n`);
  if (!One.Creed.guide.includes("good painting")) {
    throw new Error("Creed.guide must carry the painting axiom");
  }

  const alice = await One.Source.key();
  const bob = await One.Source.key();
  let state = await One.Source.begin(alice);

  const { state: next, summary } = await One.reveal({
    state,
    from: alice,
    sequencer: alice,
    outputs: [{ amount: 3, address: bob.address }],
    meta: { description: "Spoken into being", recipientLabel: "@bob" },
  });
  state = next;

  const tip = state.pixels.length - 1;
  if (One.Word.isSilent(state, tip)) throw new Error("word should have color");
  console.log("▸", summary);
  console.log("▸ proximity under light:", One.Light.near(tip).join(", ") || "(none yet)");

  // Continuity — any language, no second Facebook
  let art = await One.Light.invite({
    name: "any-app",
    kind: "other",
    digest: "ab".repeat(32),
    languages: ["rust", "python"],
    originHost: "aws",
    mirrors: ["https://peer.example/m"],
  });
  art = One.Light.accept(art, tip);
  art = One.Light.whenOriginFalls(art);
  if (!One.Light.stillHolds(art)) throw new Error("continuity broken");

  console.log("▸ origin fell; Light still holds the Word ✓");
  console.log("═══ PASS — three faces, one ledger ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

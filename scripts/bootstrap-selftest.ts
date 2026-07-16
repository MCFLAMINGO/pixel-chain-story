/**
 * Chicken-and-egg bootstrap — no $21M IPO myth.
 * bun scripts/bootstrap-selftest.ts
 */

import { Bootstrap, DAY_ONE_PATHS, bootstrapSnapshot, quoteIngressPix } from "../src/lib/pixel";

async function main() {
  console.log("═══ BOOTSTRAP ═══\n");
  const snap = bootstrapSnapshot();
  console.log(snap.axiom);
  console.log("dollarFdvFromCap:", snap.dollarFdvFromCap);
  console.log("disclaimer:", snap.ingressQuoteDisclaimer);
  console.log("");

  if (snap.dollarFdvFromCap !== null) throw new Error("must refuse FDV-from-cap");
  if (snap.hardCapPix !== 21_000_000) throw new Error("cap");
  if (snap.genesisRewardPix !== 50) throw new Error("genesis reward");
  if (snap.rewardAtPixel(0) !== 50) throw new Error("era0");
  if (snap.rewardAtPixel(210_000) !== 25) throw new Error("halving");

  const illuminate = DAY_ONE_PATHS.find((p) => p.id === "illuminate")!;
  if (illuminate.needsPixAlready || illuminate.needsDollars) {
    throw new Error("illuminate must be free of prior PIX/USD");
  }
  const shine = DAY_ONE_PATHS.find((p) => p.id === "shine_in")!;
  if (shine.needsPixAlready || !shine.needsDollars) throw new Error("shine_in");

  for (const p of snap.dayOne) {
    console.log(`· ${p.id.padEnd(16)} priorPIX=${p.needsPixAlready} $=${p.needsDollars}`);
  }

  const q = quoteIngressPix(5);
  if (q.pix !== 5) throw new Error("quote");
  if (!q.disclaimer.includes("not a peg")) throw new Error("disclaimer");
  console.log("\n▸ $5 ingress quote:", q.pix, "PIX —", q.disclaimer.slice(0, 60), "…");

  console.log("\nChicken-egg resolution:");
  for (const line of snap.chickenEgg.resolution) console.log(" —", line);

  if (!Bootstrap.axiom.includes("not a $")) throw new Error("axiom");
  console.log("\n═══ PASS — start by lighting, not by buying 21M ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

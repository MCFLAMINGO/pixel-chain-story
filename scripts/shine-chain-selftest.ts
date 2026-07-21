/**
 * Prove McFlamingo Continuity anchors on a real Pixel tip — not fake pixelIndex: 1.
 *
 * bun run test:shine-chain
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  emptyOpsState,
  illuminateStorefrontOnPixel,
  seedMcFlamingoDemo,
  digestArtifactText,
  MCFLAMINGO_ORIGIN_URL,
  MCFLAMINGO_MENU_URL,
} from "../src/lib/pixel/continuity-ops";
import { verifyChain } from "../src/lib/pixel/chain";

async function main() {
  console.log("═══ SHINE → PIXEL CHAIN ANCHOR ═══\n");

  const html = await readFile(
    join(import.meta.dir, "../public/mcflamingo/homepage-snapshot.html"),
    "utf8",
  );
  const digest = await digestArtifactText(html);
  console.log("▸ McFlamingo homepage digest", digest.slice(0, 24) + "…");

  const anchor = await illuminateStorefrontOnPixel({
    name: "McFlamingo",
    domain: "mcflamingo.com",
    originUrl: MCFLAMINGO_ORIGIN_URL,
    digest,
    mirrors: [MCFLAMINGO_ORIGIN_URL, MCFLAMINGO_MENU_URL],
  });

  if (!anchor.chainValid) throw new Error("chain invalid");
  if (!(await verifyChain(anchor.state))) throw new Error("verifyChain failed");
  if (anchor.pixelIndex < 1) throw new Error("expected tip after genesis");
  if (anchor.continuity.illuminatedAtPixel !== anchor.pixelIndex) {
    throw new Error("Continuity tip mismatch");
  }
  if (!anchor.registerRef.startsWith("CONT-")) throw new Error("register ref");
  const tip = anchor.state.pixels[anchor.pixelIndex]!;
  const refs = tip.transactions.map((t) => t.metadata.reference).join(" ");
  if (!refs.includes(anchor.registerRef)) throw new Error("CONT ref missing from tip txs");
  console.log(
    "▸ illuminated at pixel",
    anchor.pixelIndex,
    "·",
    anchor.registerRef,
    "· tip",
    anchor.tipHash.slice(0, 16) + "…",
  );

  let ops = emptyOpsState("McFlamingo Continuity");
  ops = await seedMcFlamingoDemo(ops, html, {
    originUrl: MCFLAMINGO_ORIGIN_URL,
    mirrorUrls: [MCFLAMINGO_ORIGIN_URL, MCFLAMINGO_MENU_URL],
  });
  const store = ops.stores[0]!;
  if (!store.anchoredOnPixel) throw new Error("seed must set anchoredOnPixel");
  if (store.pixelIndex === undefined || store.pixelIndex < 1) {
    throw new Error("seed must use real tip index, not fake 0/1 theater");
  }
  if (store.continuity?.illuminatedAtPixel !== store.pixelIndex) {
    throw new Error("ops Continuity tip mismatch");
  }
  if (!store.registerRef?.startsWith("CONT-")) throw new Error("ops missing CONT ref");
  if (store.digest !== digest) throw new Error("digest drift");
  console.log("▸ seedMcFlamingoDemo anchoredOnPixel tip #", store.pixelIndex, "✓");

  console.log("\nHonesty:");
  console.log("  • Digest of McFlamingo homepage is on a real Pixel tip (CONT memo)");
  console.log("  • Menu/order still served by Popmenu — Pixel holds the map, not the HTML host");
  console.log("\n═══ PASS — Continuity on Pixel ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

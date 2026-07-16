/**
 * How $5 / domain / treasury / app enter the ledger.
 * bun scripts/worldlight-selftest.ts
 */

import {
  balanceOf,
  createGenesis,
  forgePersonalSource,
  generateLightKeypair,
  illuminateIngress,
  ingressApplication,
  ingressDomain,
  ingressTreasury,
  ingressUsd,
  worldlightThesis,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ WORLDLIGHT INGRESS ═══\n");
  const t = worldlightThesis();
  console.log("USD:", t.usd);
  console.log("Domain:", t.domain);
  console.log("Treasury:", t.treasury);
  console.log("App:", t.facebook);
  console.log("");

  const you = await forgePersonalSource("you");
  const vault = await generateLightKeypair();
  let state = await createGenesis(vault);

  // $5 → PIX on your address
  const usd = await ingressUsd(5, { address: you.source.address, localId: "you" }, "wire-demo-5");
  if (usd.pixCredit !== 5) throw new Error("pix credit");
  let res = await illuminateIngress({
    prepared: usd,
    state,
    bridgeVault: vault,
    sequencer: vault,
  });
  state = res.state;
  const bal = balanceOf(state, you.source.address);
  if (bal !== 5) throw new Error(`expected 5 PIX, got ${bal}`);
  console.log("▸ $5 →", bal, "PIX on Personal Source ✓");

  // mcflamingo.com — continuity, no PIX required
  const domain = await ingressDomain("https://mcflamingo.com", {
    address: you.source.address,
    localId: "you",
  });
  res = await illuminateIngress({
    prepared: domain,
    state,
    bridgeVault: vault,
    sequencer: vault,
  });
  state = res.state;
  if (res.continuity.state !== "in_the_light") throw new Error("domain not lit");
  if (res.continuity.artifact.originUrl !== "https://mcflamingo.com") throw new Error("url");
  console.log("▸ mcflamingo.com in the light ✓ pixel", res.continuity.illuminatedAtPixel);

  // Corp treasury
  const treas = await ingressTreasury("McFlamingo Corp Treasury", "iban-hash-x", {
    address: you.source.address,
    localId: "you",
  });
  res = await illuminateIngress({
    prepared: treas,
    state,
    bridgeVault: vault,
    sequencer: vault,
  });
  state = res.state;
  if (res.continuity.artifact.name !== "McFlamingo Corp Treasury") throw new Error("treasury");
  console.log("▸ Corp treasury continuity ✓");

  // App — one codebase
  const app = await ingressApplication(
    "McFlamingo",
    "https://app.mcflamingo.com",
    { address: you.source.address, localId: "you" },
    ["typescript"],
    ["ipfs://m1"],
  );
  res = await illuminateIngress({
    prepared: app,
    state,
    bridgeVault: vault,
    sequencer: vault,
  });
  if (!res.continuity.artifact.mirrors?.length) throw new Error("mirrors");
  console.log("▸ App shone in (no second Facebook) ✓");

  // Balance unchanged by non-value ingress (still 5 + possible dust from rewards to vault only)
  const bal2 = balanceOf(res.state, you.source.address);
  if (bal2 !== 5) throw new Error(`user bal drifted: ${bal2}`);
  console.log("▸ Non-value ingress did not steal/credit user PIX ✓");

  console.log("\n═══ PASS — world enters by light, keys stay yours ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

/**
 * Phone wallet bridge — USDC / ETH / wire shine-in (lab + tip path shape).
 * bun run test:wallet-bridge
 */
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import {
  WALLET_BRIDGE_MAX_USD,
  shineInLocalLab,
  walletBridgeThesis,
  prepareWalletBridgeIngress,
} from "../src/lib/pixel/wallet-bridge";
import { LockFeeder } from "../src/lib/pixel/lock-feeder";
import { balanceOf } from "../src/lib/pixel/chain";

async function main() {
  console.log("═══ PHONE WALLET BRIDGE ═══\n");
  if (!walletBridgeThesis().includes("USDC")) throw new Error("thesis");

  const you = await generatePixelKeypair();
  console.log("▸ pay face", you.address.slice(0, 20) + "…");

  const usdc = await shineInLocalLab({
    asset: "USDC",
    humanUsd: 5,
    ownerAddress: you.address,
    ownerLocalId: "phone",
  });
  if (usdc.pixCredited !== 5) throw new Error(`USDC credit want 5 got ${usdc.pixCredited}`);
  if (balanceOf(usdc.state, you.address) !== 5) throw new Error("USDC balance");
  console.log("▸ USDC → 5 PIX local lab ✓");

  const eth = await shineInLocalLab({
    asset: "ETH",
    humanUsd: 3,
    ownerAddress: you.address,
    ownerLocalId: "phone",
  });
  if (eth.pixCredited !== 3) throw new Error("ETH quote credit");
  console.log("▸ ETH (USD quote) → 3 PIX ✓");

  const wire = await shineInLocalLab({
    asset: "USD",
    humanUsd: 2,
    ownerAddress: you.address,
    ownerLocalId: "phone",
  });
  if (wire.pixCredited !== 2) throw new Error("wire credit");
  console.log("▸ bank wire USD → 2 PIX ✓");

  let capped = false;
  try {
    await prepareWalletBridgeIngress({
      asset: "USDC",
      humanUsd: WALLET_BRIDGE_MAX_USD + 1,
      ownerAddress: you.address,
      ownerLocalId: "phone",
      rail: LockFeeder.createRail(),
      feeder: LockFeeder.createState(),
    });
  } catch {
    capped = true;
  }
  if (!capped) throw new Error("expected cap");
  console.log(`▸ cap $${WALLET_BRIDGE_MAX_USD} ✓`);

  console.log("\n═══ PASS — phone wallet bridge ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

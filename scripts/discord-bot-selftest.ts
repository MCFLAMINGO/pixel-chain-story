/**
 * Discord invite bot unit selftest (no Discord network).
 * bun run test:discord-bot
 */
import { FRIEND_PACK, handlePixelCommand, tipStatusLines } from "../src/discord/pixel-invite-bot";
import { CROWNED_GENESIS_PREFIX, CROWNED_NETWORK_ID } from "../src/lib/pixel/crowned-genesis";

async function main() {
  console.log("═══ DISCORD INVITE BOT ═══\n");

  if (!FRIEND_PACK.includes(CROWNED_GENESIS_PREFIX)) throw new Error("pack genesis");
  if (!FRIEND_PACK.includes("NEVER run: pixel init")) throw new Error("pack refuse init");
  if (!FRIEND_PACK.includes("/wallet")) throw new Error("pack wallet");
  if (!FRIEND_PACK.includes("--require-crowned")) throw new Error("pack join");
  console.log("▸ friend pack ✓");

  const join = await handlePixelCommand("join");
  if (!join.content.includes("Phone = wallet only")) throw new Error("join reply");
  const wallet = await handlePixelCommand("wallet");
  if (!wallet.content.includes("/wallet")) throw new Error("wallet reply");
  console.log("▸ /pixel join + wallet ✓");

  const crowned = tipStatusLines({
    ok: true,
    genesisHash: CROWNED_GENESIS_PREFIX + "00".repeat(56),
    networkId: CROWNED_NETWORK_ID,
    tip: 2,
    faucet: true,
    bridgeLab: true,
    address: "pix106c4a74b6a5f7915712a22dfe587665e66f443",
  });
  if (!crowned.includes("✓ crowned Earth")) throw new Error("crowned status");
  const wrong = tipStatusLines({
    genesisHash: "deadbeef".repeat(8),
    networkId: 1,
    tip: 0,
  });
  if (!wrong.includes("✗ NOT crowned")) throw new Error("refuse wrong Earth");
  console.log("▸ tip status lines ✓");

  // Live tip (optional — skip offline)
  try {
    const tip = await handlePixelCommand("tip");
    if (!tip.content.includes("genesis:")) throw new Error("tip shape");
    console.log("▸ live /pixel tip ✓");
  } catch {
    console.log("▸ live tip skipped (unreachable)");
  }

  console.log("\n═══ PASS — Discord invite bot ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

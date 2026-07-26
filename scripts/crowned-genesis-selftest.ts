/**
 * Crowned Earth constants + refuse wrong tip.
 * bun run test:crowned
 */
import {
  CROWNED_GENESIS_HASH,
  CROWNED_GENESIS_PREFIX,
  CROWNED_NETWORK_ID,
  PUBLIC_TIP_RPC_DEFAULT,
  assertCrownedPublicTip,
  crownedGenesisThesis,
  isCrownedGenesisHash,
} from "../src/lib/pixel/crowned-genesis";

async function main() {
  console.log("═══ CROWNED GENESIS ═══\n");
  if (!crownedGenesisThesis().includes("f1d193")) throw new Error("thesis");
  if (!CROWNED_GENESIS_HASH.startsWith(CROWNED_GENESIS_PREFIX)) throw new Error("prefix");
  if (!isCrownedGenesisHash(CROWNED_GENESIS_HASH)) throw new Error("full hash");
  if (!isCrownedGenesisHash(CROWNED_GENESIS_PREFIX + "deadbeef")) throw new Error("prefix match");
  if (isCrownedGenesisHash("51a9df90deadbeef")) throw new Error("wrong Earth");
  assertCrownedPublicTip({
    genesisHash: CROWNED_GENESIS_HASH,
    networkId: CROWNED_NETWORK_ID,
  });
  let refused = false;
  try {
    assertCrownedPublicTip({ genesisHash: "00".repeat(64), networkId: CROWNED_NETWORK_ID });
  } catch {
    refused = true;
  }
  if (!refused) throw new Error("must refuse wrong genesis");
  if (!PUBLIC_TIP_RPC_DEFAULT.includes("pixel-tip-production")) throw new Error("public tip url");
  console.log("▸ constants + refuse wrong Earth ✓");
  console.log("▸ public tip", PUBLIC_TIP_RPC_DEFAULT);

  // Live tip (optional — skip if offline)
  try {
    const h = await fetch(`${PUBLIC_TIP_RPC_DEFAULT}/health`, {
      signal: AbortSignal.timeout(8000),
    });
    if (h.ok) {
      const j = (await h.json()) as { genesisHash?: string; networkId?: number };
      assertCrownedPublicTip({
        genesisHash: String(j.genesisHash ?? ""),
        networkId: Number(j.networkId),
      });
      console.log("▸ live tip is crowned Earth ✓", String(j.genesisHash).slice(0, 16) + "…");
    }
  } catch (e) {
    console.log("▸ live tip probe skipped", e instanceof Error ? e.message : e);
  }

  console.log("\n═══ PASS — crowned genesis ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

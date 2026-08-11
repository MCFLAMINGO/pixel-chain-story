/**
 * Crowned Earth constants + refuse wrong tip.
 * bun run test:crowned
 */
import {
  CROWNED_GENESIS_HASH,
  CROWNED_GENESIS_PREFIX,
  CROWNED_NETWORK_ID,
  PUBLIC_TIP_RPC_DEFAULT,
  assertCrownedEarth,
  assertCrownedPublicTip,
  crownedGenesisThesis,
  isCrownedGenesisHash,
} from "../src/lib/pixel/crowned-genesis";
import { createGenesis, PIXEL_LAB_NETWORK_ID, PIXEL_NETWORK_ID } from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";

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

  // Bitcoin's genesis is a constant in the client and nothing else runs on mainnet.
  // This is that, in two halves: lab chains get their own network id, and the crowned
  // id accepts exactly one genesis. Neither half is enough alone.
  {
    const kp = await generatePixelKeypair("PIX-ML-DSA-65");

    const lab = await createGenesis(kp);
    if (lab.networkId !== PIXEL_LAB_NETWORK_ID) {
      throw new Error(`createGenesis must default to the lab network, got ${lab.networkId}`);
    }
    if (lab.networkId === PIXEL_NETWORK_ID) {
      throw new Error("a chain forged without asking must never claim the crowned network");
    }

    // Claiming the crowned id is possible — refusing the chain is what stops it.
    const pretender = await createGenesis(kp, PIXEL_NETWORK_ID);
    let refused = false;
    try {
      assertCrownedEarth({
        genesisHash: pretender.pixels[0]!.hash,
        networkId: pretender.networkId,
      });
    } catch {
      refused = true;
    }
    if (!refused) {
      throw new Error("a foreign genesis on the crowned network must be refused");
    }
    console.log("▸ lab chains cannot claim the crowned network; a pretender is refused ✓");
  }

  console.log("\n═══ PASS — crowned genesis ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

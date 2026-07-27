/**
 * Lab-only: forge a throwaway genesis into a datadir.
 * Not a people door — CI / two-node demos only.
 *
 *   PIXEL_ALLOW_LAB_GENESIS=1 bun scripts/lab-forge-datadir.ts --datadir ./data/a
 */
import { createGenesis } from "../src/lib/pixel/index";
import { ensureDatadir, loadOrCreateIdentity, saveChain } from "../src/node/store";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

async function main() {
  const allow =
    process.env.PIXEL_ALLOW_LAB_GENESIS === "1" || process.env.PIXEL_ALLOW_LAB_GENESIS === "true";
  if (!allow) {
    console.error(
      "Lab forge refused. People join the crowned tip — not init a new Earth.\n" +
        "  Friends: bun run pixel -- join --peer https://pixel-tip-production.up.railway.app --datadir ./data/friend\n" +
        "  CI/demo only: PIXEL_ALLOW_LAB_GENESIS=1 bun scripts/lab-forge-datadir.ts --datadir DIR",
    );
    process.exit(1);
  }
  const datadir = arg("datadir", "./pixel-data")!;
  await ensureDatadir(datadir);
  const { keypair } = await loadOrCreateIdentity(datadir, "lab-genesis");
  const chain = await createGenesis(keypair);
  await saveChain(datadir, chain);
  console.log(`lab genesis forged · ${chain.pixels[0]!.hash.slice(0, 24)}…`);
  console.log(`  datadir: ${datadir}`);
  console.log(`  sequencer: ${keypair.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

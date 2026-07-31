/**
 * Deploy MockUSDC + PixelUsdcLock to an EVM testnet and print tip env.
 *
 *   PIXEL_EVM_CHAIN=sepolia|base-sepolia|amoy|arb-sepolia
 *   SEPOLIA_PRIVATE_KEY / PIXEL_EVM_DEPLOY_KEY  (funded gas token)
 *   optional PIXEL_EVM_RPC override
 *
 * bun run deploy:evm-lock
 * bun run deploy:sepolia-lock   # alias → sepolia
 */
import { spawnSync } from "node:child_process";
import { EVM_CHAIN_PRESETS, resolveEvmPreset } from "../src/lib/pixel/eth-usdc-lock";

const FOUNDRY = `${process.env.HOME}/.foundry/bin`;
const PATH = `${FOUNDRY}:${process.env.PATH}`;

function sh(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, PATH } });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")}\n${r.stderr || r.stdout}`);
  }
  return (r.stdout || "").trim();
}

function parseDeployAddress(out: string): string {
  const m = out.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
  if (!m) throw new Error(`no deploy address in:\n${out}`);
  return m[1];
}

async function main() {
  const chainKey = (process.env.PIXEL_EVM_CHAIN ?? "sepolia").trim().toLowerCase();
  if (!EVM_CHAIN_PRESETS[chainKey]) {
    console.error(
      `Unknown PIXEL_EVM_CHAIN=${chainKey}. Choose: ${Object.keys(EVM_CHAIN_PRESETS).join(", ")}`,
    );
    process.exit(2);
  }
  const preset = resolveEvmPreset(chainKey);
  const rpc = (
    process.env.PIXEL_EVM_RPC ??
    process.env.SEPOLIA_RPC_URL ??
    preset.defaultRpc
  ).trim();
  const pk = (process.env.PIXEL_EVM_DEPLOY_KEY ?? process.env.SEPOLIA_PRIVATE_KEY ?? "").trim();
  if (!pk) {
    console.error(
      "Set PIXEL_EVM_DEPLOY_KEY or SEPOLIA_PRIVATE_KEY (funded testnet gas), then re-run.",
    );
    console.error(`Suggested faucet search: "${preset.name} faucet"`);
    process.exit(2);
  }

  console.log(`═══ DEPLOY PixelUsdcLock @ ${preset.name} ═══\n`);
  console.log("▸ chain", preset.key, preset.chainId);
  console.log("▸ rpc", rpc);

  const usdc = parseDeployAddress(
    sh(`${FOUNDRY}/forge`, [
      "create",
      "contracts/MockUSDC.sol:MockUSDC",
      "--rpc-url",
      rpc,
      "--private-key",
      pk,
      "--broadcast",
    ]),
  );
  console.log("▸ MockUSDC", usdc);

  const lock = parseDeployAddress(
    sh(`${FOUNDRY}/forge`, [
      "create",
      "contracts/PixelUsdcLock.sol:PixelUsdcLock",
      "--rpc-url",
      rpc,
      "--private-key",
      pk,
      "--broadcast",
      "--constructor-args",
      usdc,
    ]),
  );
  console.log("▸ PixelUsdcLock", lock);

  console.log(`
── Tip host env (Railway pixel-tip) ──
PIXEL_BRIDGE_EVM=1
PIXEL_EVM_CHAIN=${preset.key}
PIXEL_EVM_RPC=${rpc}
PIXEL_EVM_CHAIN_ID=${preset.chainId}
PIXEL_EVM_LOCK=${lock}
PIXEL_EVM_USDC=${usdc}
PIXEL_EVM_EXPLORER_TX=${preset.explorerTxBase}
# optional demo rail:
PIXEL_BRIDGE_LAB=1
PIXEL_FAUCET=1

── First public lock ──
1. Mint mock USDC → approve → lock(amount, pix1…, salt) on ${preset.name}
2. Phone /wallet → Bridge → paste lock tx → Shine lock → PIX
3. Paste explorer URLs into docs/BRIDGE-STATUS.md

Honesty: foreign chain is receipt-only. PIX settles on the crowned Pixel tip.
`);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

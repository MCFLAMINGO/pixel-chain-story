/**
 * Deploy MockUSDC + PixelUsdcLock to Sepolia and print tip env.
 *
 * Requires:
 *   SEPOLIA_RPC_URL   (or PIXEL_ETH_RPC)
 *   SEPOLIA_PRIVATE_KEY  (funded Sepolia ETH)
 *
 * bun run scripts/deploy-sepolia-usdc-lock.ts
 */
import { spawnSync } from "node:child_process";

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
  const rpc =
    process.env.SEPOLIA_RPC_URL?.trim() ||
    process.env.PIXEL_ETH_RPC?.trim() ||
    "https://ethereum-sepolia-rpc.publicnode.com";
  const pk = process.env.SEPOLIA_PRIVATE_KEY?.trim();
  if (!pk) {
    console.error(
      "Set SEPOLIA_PRIVATE_KEY (funded Sepolia ETH) and optionally SEPOLIA_RPC_URL, then re-run.",
    );
    process.exit(2);
  }

  console.log("═══ DEPLOY PixelUsdcLock @ Sepolia ═══\n");
  console.log("▸ rpc", rpc);

  const usdcOut = sh(`${FOUNDRY}/forge`, [
    "create",
    "contracts/MockUSDC.sol:MockUSDC",
    "--rpc-url",
    rpc,
    "--private-key",
    pk,
    "--broadcast",
  ]);
  const usdc = parseDeployAddress(usdcOut);
  console.log("▸ MockUSDC", usdc);

  const lockOut = sh(`${FOUNDRY}/forge`, [
    "create",
    "contracts/PixelUsdcLock.sol:PixelUsdcLock",
    "--rpc-url",
    rpc,
    "--private-key",
    pk,
    "--broadcast",
    "--constructor-args",
    usdc,
  ]);
  const lock = parseDeployAddress(lockOut);
  console.log("▸ PixelUsdcLock", lock);

  console.log(`
── Tip host env (Railway pixel-tip) ──
PIXEL_BRIDGE_SEPOLIA=1
PIXEL_ETH_RPC=${rpc}
PIXEL_ETH_CHAIN_ID=11155111
PIXEL_USDC_LOCK_SEPOLIA=${lock}
PIXEL_USDC_TOKEN_SEPOLIA=${usdc}
PIXEL_ETH_EXPLORER_TX=https://sepolia.etherscan.io/tx/
# Keep lab demo rail optional:
PIXEL_BRIDGE_LAB=1
PIXEL_FAUCET=1

── First public lock (after tip redeploy) ──
1. Mint mock USDC to your EOA, approve lock, lock(amount, pix1…, salt)
2. Phone /wallet → Bridge → paste lock tx → Shine lock → PIX
3. Paste explorer URLs into docs/BRIDGE-STATUS.md
`);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

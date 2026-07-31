/**
 * Sepolia-path shape on anvil: Locked → tip /bridge/shine-in-lock → PIX.
 * bun run test:sepolia-bridge
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { createGenesis, generatePixelKeypair } from "../src/lib/pixel/index";
import { PixelLedgerNode } from "../src/node/node";
import { startRpcServer } from "../src/node/rpc-server";
import { loadOrCreateIdentity, saveChain } from "../src/node/store";

const FOUNDRY = `${process.env.HOME}/.foundry/bin`;
const PATH = `${FOUNDRY}:${process.env.PATH}`;
const BASE = `/tmp/pixel-sepolia-bridge-${process.pid}`;
const RPC = 19_300 + (process.pid % 400);

async function sh(cmd: string, args: string[]): Promise<string> {
  const { spawnSync } = await import("node:child_process");
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
  console.log("═══ SEPOLIA LOCK BRIDGE (anvil stand-in) ═══\n");

  let anvil: ChildProcess | null = null;
  try {
    anvil = spawn(`${FOUNDRY}/anvil`, ["--silent", "--chain-id", "11155111"], {
      env: { ...process.env, PATH },
      stdio: "ignore",
    });
    await sleep(900);

    const pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const locker = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const ethRpc = "http://127.0.0.1:8545";

    const usdc = parseDeployAddress(
      await sh(`${FOUNDRY}/forge`, [
        "create",
        "contracts/MockUSDC.sol:MockUSDC",
        "--rpc-url",
        ethRpc,
        "--private-key",
        pk,
        "--broadcast",
      ]),
    );
    const lock = parseDeployAddress(
      await sh(`${FOUNDRY}/forge`, [
        "create",
        "contracts/PixelUsdcLock.sol:PixelUsdcLock",
        "--rpc-url",
        ethRpc,
        "--private-key",
        pk,
        "--broadcast",
        "--constructor-args",
        usdc,
      ]),
    );
    console.log("▸ MockUSDC", usdc);
    console.log("▸ PixelUsdcLock", lock);

    process.env.PIXEL_ALLOW_LAB_GENESIS = "1";
    process.env.PIXEL_TIP_HOST = "1";
    process.env.PIXEL_BRIDGE_SEPOLIA = "1";
    process.env.PIXEL_USDC_LOCK_SEPOLIA = lock;
    process.env.PIXEL_USDC_TOKEN_SEPOLIA = usdc;
    process.env.PIXEL_ETH_RPC = ethRpc;
    process.env.PIXEL_ETH_CHAIN_ID = "11155111";
    process.env.PIXEL_BRIDGE_LAB = "0";
    process.env.PIXEL_FAUCET = "0";

    await rm(BASE, { recursive: true, force: true });
    await mkdir(BASE, { recursive: true });
    const { keypair } = await loadOrCreateIdentity(BASE, "tip");
    await saveChain(BASE, await createGenesis(keypair));

    const node = new PixelLedgerNode({
      datadir: BASE,
      rpcPort: RPC,
      gossipPort: 0,
      autoSequenceMs: 0,
      stallCheckMs: 0,
    });
    await node.start();
    startRpcServer(node, RPC);
    await Bun.sleep(80);
    const base = `http://127.0.0.1:${RPC}`;

    const you = await generatePixelKeypair();
    const amountRaw = "5000000";
    const salt = "0x2222222222222222222222222222222222222222222222222222222222222222";

    await sh(`${FOUNDRY}/cast`, [
      "send",
      usdc,
      "mint(address,uint256)",
      locker,
      amountRaw,
      "--rpc-url",
      ethRpc,
      "--private-key",
      pk,
    ]);
    await sh(`${FOUNDRY}/cast`, [
      "send",
      usdc,
      "approve(address,uint256)",
      lock,
      amountRaw,
      "--rpc-url",
      ethRpc,
      "--private-key",
      pk,
    ]);
    const txOut = await sh(`${FOUNDRY}/cast`, [
      "send",
      lock,
      "lock(uint256,string,bytes32)",
      amountRaw,
      you.address,
      salt,
      "--rpc-url",
      ethRpc,
      "--private-key",
      pk,
      "--json",
    ]);
    const parsedTx = JSON.parse(txOut) as { transactionHash?: string; hash?: string };
    const txHash = (parsedTx.transactionHash || parsedTx.hash) as string;
    console.log("▸ lock tx", txHash);

    const health = (await fetch(`${base}/health`).then((r) => r.json())) as {
      bridgeSepolia?: { lock: string };
      bridgeLab?: boolean;
    };
    if (!health.bridgeSepolia?.lock) throw new Error("health missing bridgeSepolia");
    if (health.bridgeLab) throw new Error("lab bridge should be off for this test");
    console.log("▸ health bridgeSepolia ✓");

    const shine = (await fetch(`${base}/bridge/shine-in-lock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        txHash,
        ownerAddress: you.address,
        ownerLocalId: "sepolia-you",
      }),
    }).then((r) => r.json())) as {
      ok?: boolean;
      pixCredited?: number;
      error?: string;
      plane?: string;
    };
    if (!shine.ok || shine.pixCredited !== 5) {
      throw new Error(shine.error ?? JSON.stringify(shine));
    }
    if (shine.plane !== "shared_tip") throw new Error("plane");
    console.log("▸ shine-in-lock →", shine.pixCredited, "PIX ✓");

    const again = await fetch(`${base}/bridge/shine-in-lock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash, ownerAddress: you.address }),
    });
    const aj = (await again.json()) as { ok?: boolean; error?: string };
    if (aj.ok) throw new Error("expected double-spend refuse");
    console.log("▸ double shine refused ✓");

    const lab = await fetch(`${base}/bridge/shine-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        asset: "USDC",
        humanUsd: 1,
        ownerAddress: you.address,
        ownerLocalId: "x",
      }),
    });
    if (lab.status !== 404) throw new Error(`lab shine-in want 404 got ${lab.status}`);
    console.log("▸ lab shine-in gated ✓");

    console.log("\n═══ PASS — sepolia lock bridge path ═══");
    // Let queued tip persist finish before deleting datadir.
    await Bun.sleep(120);
  } finally {
    if (anvil?.pid) {
      try {
        process.kill(anvil.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
    await Bun.sleep(50);
    await rm(BASE, { recursive: true, force: true }).catch(() => undefined);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

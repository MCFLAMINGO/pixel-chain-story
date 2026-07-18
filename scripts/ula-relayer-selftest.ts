/**
 * Gate E relayer path:
 *   anvil PixelUsdcLock.Locked → LockFeeder.feed (log-verified) → shineIn
 *
 * bun run scripts/ula-relayer-selftest.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  LockFeeder,
  balanceOf,
  createGenesis,
  forgePersonalSource,
  generateLightKeypair,
  illuminateIngress,
} from "../src/lib/pixel";

const FOUNDRY = `${process.env.HOME}/.foundry/bin`;
const PATH = `${FOUNDRY}:${process.env.PATH}`;

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
  console.log("═══ ULA RELAYER (anvil Locked → feed → shineIn) ═══\n");

  let anvil: ChildProcess | null = null;
  try {
    anvil = spawn(`${FOUNDRY}/anvil`, ["--silent"], {
      env: { ...process.env, PATH },
      stdio: "ignore",
    });
    await sleep(800);

    const pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const locker = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

    const usdcOut = await sh(`${FOUNDRY}/forge`, [
      "create",
      "contracts/MockUSDC.sol:MockUSDC",
      "--rpc-url",
      "http://127.0.0.1:8545",
      "--private-key",
      pk,
      "--broadcast",
    ]);
    const usdc = parseDeployAddress(usdcOut);
    console.log("▸ MockUSDC", usdc);

    const lockOut = await sh(`${FOUNDRY}/forge`, [
      "create",
      "contracts/PixelUsdcLock.sol:PixelUsdcLock",
      "--rpc-url",
      "http://127.0.0.1:8545",
      "--private-key",
      pk,
      "--broadcast",
      "--constructor-args",
      usdc,
    ]);
    const lock = parseDeployAddress(lockOut);
    console.log("▸ PixelUsdcLock", lock);

    const you = await forgePersonalSource("relayer-you");
    const amountRaw = "5000000"; // $5
    const salt = "0x1111111111111111111111111111111111111111111111111111111111111111";

    await sh(`${FOUNDRY}/cast`, [
      "send",
      usdc,
      "mint(address,uint256)",
      locker,
      amountRaw,
      "--rpc-url",
      "http://127.0.0.1:8545",
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
      "http://127.0.0.1:8545",
      "--private-key",
      pk,
    ]);

    const txOut = await sh(`${FOUNDRY}/cast`, [
      "send",
      lock,
      "lock(uint256,string,bytes32)",
      amountRaw,
      you.source.address,
      salt,
      "--rpc-url",
      "http://127.0.0.1:8545",
      "--private-key",
      pk,
      "--json",
    ]);
    const tx = JSON.parse(txOut);
    const txHash: string = tx.transactionHash || tx.hash;
    console.log("▸ lock tx", txHash);

    // Locked(uint256,address,uint256,string,bytes32,bytes32)
    // topics[1]=lockId, topics[2]=locker; data = amount, recipient, salt, lockDigest
    const receiptJson = await sh(`${FOUNDRY}/cast`, [
      "receipt",
      txHash,
      "--rpc-url",
      "http://127.0.0.1:8545",
      "--json",
    ]);
    const receipt = JSON.parse(receiptJson);
    const log = (receipt.logs as Array<{ address: string; topics: string[]; data: string }>).find(
      (l) => l.address.toLowerCase() === lock.toLowerCase(),
    );
    if (!log) throw new Error("Locked log missing");

    const lockId = Number(BigInt(log.topics[1]));

    // Non-indexed ABI: amount, offset(string), salt, lockDigest, then string bytes
    const data = log.data.replace(/^0x/, "");
    const amountHex = data.slice(0, 64);
    const saltOnChain = "0x" + data.slice(128, 192);
    const lockDigestOnChain = "0x" + data.slice(192, 256);
    const strOffset = Number(BigInt("0x" + data.slice(64, 128))) * 2;
    const strLen = Number(BigInt("0x" + data.slice(strOffset, strOffset + 64)));
    const strHex = data.slice(strOffset + 64, strOffset + 64 + strLen * 2);
    const pixelRecipient = Buffer.from(strHex, "hex").toString("utf8");

    if (pixelRecipient !== you.source.address) {
      throw new Error(`recipient mismatch ${pixelRecipient}`);
    }
    if (BigInt("0x" + amountHex) !== BigInt(amountRaw)) {
      throw new Error("amount mismatch");
    }
    console.log("▸ Locked event lockId", lockId, "digest", lockDigestOnChain.slice(0, 18) + "…");

    const lockReceipt = LockFeeder.fromLockedEvent({
      lockId,
      locker,
      amountRaw,
      pixelRecipient,
      salt: saltOnChain.slice(2),
      lockDigest: lockDigestOnChain.slice(2),
      chainId: "31337",
      contractAddress: lock,
    });

    const vault = await generateLightKeypair();
    let state = await createGenesis(vault);
    const feeder = LockFeeder.createState();

    const prepared = await LockFeeder.feed({
      receipt: lockReceipt,
      ownerLocalId: "relayer-you",
      feeder,
      ethereumLogVerified: true,
    });
    const res = await illuminateIngress({
      prepared,
      state,
      bridgeVault: vault,
      sequencer: vault,
    });
    LockFeeder.consume(feeder, lockReceipt.lockDigest);
    state = res.state;

    const bal = balanceOf(state, you.source.address);
    console.log("▸ shineIn PIX balance", bal);
    if (bal <= 0) throw new Error("expected PIX after shineIn");

    console.log("\nrelayer path: Locked → feed(ethereumLogVerified) → shineIn OK");
    console.log("anvil tx (local):", txHash);
    console.log("OK");
  } finally {
    if (anvil?.pid) {
      try {
        process.kill(anvil.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Ethereum PixelUsdcLock — verify Locked logs and build LockReceipts.
 *
 * Tip path: eth_getTransactionReceipt → parse Locked → ethereumLogVerified feed.
 * Not a mainnet USDC claim until BRIDGE-STATUS lists public links.
 */

import { LockFeeder, type LockReceipt } from "./lock-feeder";
import type { Hex } from "./crypto";

/** Locked(uint256,address,uint256,string,bytes32,bytes32) */
export const PIXEL_USDC_LOCKED_TOPIC0 =
  "0xea9a5e91412e9442166293d1e2c202003412c51308551c388e6761ec2b201933";

export const PIXEL_USDC_LOCK_FN = "0xf45368f6";
export const ERC20_APPROVE_FN = "0x095ea7b3";
export const MOCK_USDC_MINT_FN = "0x40c10f19";

export const SEPOLIA_CHAIN_ID = 11155111;

export type EthRpcLog = {
  address: string;
  topics: string[];
  data: string;
};

export type EthTxReceipt = {
  transactionHash?: string;
  status?: string | number;
  logs?: EthRpcLog[];
  blockNumber?: string;
};

export type ParsedLockedEvent = {
  lockId: number;
  locker: string;
  amountRaw: string;
  pixelRecipient: string;
  salt: Hex;
  lockDigest: Hex;
  contractAddress: string;
  txHash: string;
};

export function pad32(hexNoPrefix: string): string {
  return hexNoPrefix.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

export function encodeAddress(addr: string): string {
  return pad32(addr.replace(/^0x/, ""));
}

export function encodeUint256(n: bigint | number | string): string {
  return pad32(BigInt(n).toString(16));
}

/** ABI-encode lock(uint256,string,bytes32) calldata. */
export function encodeLockCalldata(params: {
  amountRaw: bigint;
  pixelRecipient: string;
  salt: Hex;
}): `0x${string}` {
  const sel = PIXEL_USDC_LOCK_FN.replace(/^0x/, "");
  const amount = encodeUint256(params.amountRaw);
  // head: amount, offset-to-string (0x60), salt
  const offset = encodeUint256(0x60);
  const salt = pad32(params.salt);
  const strBytes = new TextEncoder().encode(params.pixelRecipient);
  const strLen = encodeUint256(strBytes.length);
  const pad = (32 - (strBytes.length % 32)) % 32;
  const strData = `${[...strBytes].map((b) => b.toString(16).padStart(2, "0")).join("")}${"00".repeat(pad)}`;
  return `0x${sel}${amount}${offset}${salt}${strLen}${strData}`;
}

/** ABI-encode approve(address,uint256). */
export function encodeApproveCalldata(spender: string, amountRaw: bigint): `0x${string}` {
  return `0x${ERC20_APPROVE_FN.replace(/^0x/, "")}${encodeAddress(spender)}${encodeUint256(amountRaw)}`;
}

/** ABI-encode mint(address,uint256) for MockUSDC. */
export function encodeMintCalldata(to: string, amountRaw: bigint): `0x${string}` {
  return `0x${MOCK_USDC_MINT_FN.replace(/^0x/, "")}${encodeAddress(to)}${encodeUint256(amountRaw)}`;
}

export async function ethRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl.replace(/\/$/, ""), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? "eth rpc error");
  return body.result as T;
}

export async function ethChainId(rpcUrl: string): Promise<number> {
  const hex = await ethRpc<string>(rpcUrl, "eth_chainId", []);
  return Number(BigInt(hex));
}

export function parseLockedLog(params: {
  log: EthRpcLog;
  txHash: string;
}): ParsedLockedEvent {
  const { log, txHash } = params;
  if ((log.topics[0] ?? "").toLowerCase() !== PIXEL_USDC_LOCKED_TOPIC0.toLowerCase()) {
    throw new Error("not a PixelUsdcLock Locked event");
  }
  if (!log.topics[1] || !log.topics[2]) throw new Error("Locked topics missing");
  const lockId = Number(BigInt(log.topics[1]));
  const locker = "0x" + log.topics[2].slice(-40);

  const data = log.data.replace(/^0x/, "");
  if (data.length < 256) throw new Error("Locked data too short");
  const amountHex = data.slice(0, 64);
  const saltOnChain = data.slice(128, 192);
  const lockDigestOnChain = data.slice(192, 256);
  const strOffset = Number(BigInt("0x" + data.slice(64, 128))) * 2;
  const strLen = Number(BigInt("0x" + data.slice(strOffset, strOffset + 64)));
  const strHex = data.slice(strOffset + 64, strOffset + 64 + strLen * 2);
  const pixelRecipient = new TextDecoder().decode(
    Uint8Array.from(strHex.match(/.{1,2}/g)?.map((h) => Number.parseInt(h, 16)) ?? []),
  );

  return {
    lockId,
    locker,
    amountRaw: BigInt("0x" + amountHex).toString(),
    pixelRecipient,
    salt: saltOnChain as Hex,
    lockDigest: lockDigestOnChain as Hex,
    contractAddress: log.address,
    txHash,
  };
}

export function findLockedLog(
  receipt: EthTxReceipt,
  lockContract: string,
): EthRpcLog | undefined {
  const want = lockContract.toLowerCase();
  return (receipt.logs ?? []).find(
    (l) =>
      l.address.toLowerCase() === want &&
      (l.topics[0] ?? "").toLowerCase() === PIXEL_USDC_LOCKED_TOPIC0.toLowerCase(),
  );
}

/**
 * Fetch + verify a PixelUsdcLock Locked receipt against an allowlisted contract + chain.
 */
export async function verifyUsdcLockTx(params: {
  ethRpcUrl: string;
  txHash: string;
  lockContract: string;
  expectedChainId: number;
  /** Optional: require this pix1 recipient */
  expectPixelRecipient?: string;
}): Promise<ParsedLockedEvent> {
  const txHash = params.txHash.startsWith("0x") ? params.txHash : `0x${params.txHash}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error("bad lock tx hash");

  const chainId = await ethChainId(params.ethRpcUrl);
  if (chainId !== params.expectedChainId) {
    throw new Error(`eth chainId ${chainId} ≠ expected ${params.expectedChainId}`);
  }

  const receipt = await ethRpc<EthTxReceipt | null>(params.ethRpcUrl, "eth_getTransactionReceipt", [
    txHash,
  ]);
  if (!receipt) throw new Error("lock tx not found / pending");
  const status = receipt.status;
  if (status !== undefined && status !== "0x1" && status !== 1 && status !== "1") {
    throw new Error("lock tx failed on-chain");
  }

  const log = findLockedLog(receipt, params.lockContract);
  if (!log) throw new Error("Locked log missing for configured PixelUsdcLock");

  const parsed = parseLockedLog({
    log,
    txHash: receipt.transactionHash ?? txHash,
  });
  if (params.expectPixelRecipient && parsed.pixelRecipient !== params.expectPixelRecipient) {
    throw new Error(
      `lock recipient ${parsed.pixelRecipient} ≠ pay face ${params.expectPixelRecipient}`,
    );
  }
  if (!parsed.pixelRecipient.startsWith("pix1")) {
    throw new Error("lock recipient must be pix1…");
  }
  return parsed;
}

export function lockReceiptFromParsed(
  parsed: ParsedLockedEvent,
  chainId: number | string,
): LockReceipt {
  return LockFeeder.fromLockedEvent({
    lockId: parsed.lockId,
    locker: parsed.locker,
    amountRaw: parsed.amountRaw,
    pixelRecipient: parsed.pixelRecipient,
    salt: parsed.salt,
    lockDigest: parsed.lockDigest,
    chainId: String(chainId),
    contractAddress: parsed.contractAddress,
  });
}

/** Tip / site config for Sepolia mock-USDC lock (testnet, not Circle mainnet). */
export type SepoliaBridgeConfig = {
  enabled: boolean;
  chainId: number;
  ethRpcUrl: string;
  lockContract: string;
  usdcContract: string;
  explorerTxBase: string;
};

export function readSepoliaBridgeConfig(
  env: NodeJS.ProcessEnv = process.env,
): SepoliaBridgeConfig | null {
  const enabled =
    env.PIXEL_BRIDGE_SEPOLIA === "1" ||
    env.PIXEL_BRIDGE_SEPOLIA === "true" ||
    Boolean(env.PIXEL_USDC_LOCK_SEPOLIA?.trim());
  const lockContract = (env.PIXEL_USDC_LOCK_SEPOLIA ?? "").trim();
  const ethRpcUrl = (env.PIXEL_ETH_RPC ?? env.SEPOLIA_RPC_URL ?? "").trim();
  const usdcContract = (env.PIXEL_USDC_TOKEN_SEPOLIA ?? "").trim();
  if (!enabled || !lockContract || !ethRpcUrl) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(lockContract)) return null;
  return {
    enabled: true,
    chainId: Number(env.PIXEL_ETH_CHAIN_ID ?? SEPOLIA_CHAIN_ID),
    ethRpcUrl,
    lockContract,
    usdcContract,
    explorerTxBase: (env.PIXEL_ETH_EXPLORER_TX ?? "https://sepolia.etherscan.io/tx/").replace(
      /\/?$/,
      "/",
    ),
  };
}

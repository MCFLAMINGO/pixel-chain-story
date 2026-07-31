/**
 * Browser helper: lock MockUSDC into PixelUsdcLock via injected ethereum
 * (Rabby, MetaMask, etc). Phone Safari without an injected wallet: paste a
 * lock tx hash instead (WalletConnect later).
 */

import {
  encodeApproveCalldata,
  encodeLockCalldata,
  encodeMintCalldata,
  EVM_CHAIN_PRESETS,
  type EvmBridgeConfig,
} from "./eth-usdc-lock";
import { bytesToHex, randomBytes, type Hex } from "./crypto";

/** @deprecated alias */
export type SepoliaBridgeConfig = EvmBridgeConfig;

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isRabby?: boolean;
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    rabby?: EthereumProvider;
  }
}

/**
 * Prefer Rabby when several wallets inject `window.ethereum` (common on desktop).
 */
export function getInjectedEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  if (window.rabby && typeof window.rabby.request === "function") return window.rabby;
  const eth = window.ethereum;
  if (!eth) return null;
  const many = eth.providers?.filter((p) => typeof p?.request === "function") ?? [];
  if (many.length > 0) {
    return many.find((p) => p.isRabby) || many.find((p) => p.isMetaMask) || many[0] || null;
  }
  return eth;
}

/** Injected wallets often throw plain `{ code, message }` — not always `Error`. */
export function ethProviderErrorMessage(err: unknown, step?: string): string {
  const prefix = step ? `${step}: ` : "";
  if (err instanceof Error && err.message) {
    if (step && err.message.startsWith(step)) return err.message;
    return `${prefix}${err.message}`;
  }
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown; data?: { message?: unknown } };
    if (typeof o.message === "string" && o.message.trim()) {
      if (o.code === 4001 || /user rejected|rejected the request/i.test(o.message)) {
        return `${prefix}you rejected — open Rabby and approve (don't dismiss)`;
      }
      if (o.code === 4902) return `${prefix}add Ethereum Sepolia in Rabby, then try again`;
      if (o.code === -32002) {
        return `${prefix}Rabby has a pending request — open the Rabby extension, clear/approve it, refresh this page`;
      }
      return `${prefix}${o.message}`;
    }
    if (typeof o.data?.message === "string" && o.data.message.trim()) {
      return `${prefix}${o.data.message}`;
    }
    if (o.code === 4001) return `${prefix}you rejected the request`;
    if (o.code === -32002) {
      return `${prefix}Rabby has a pending request — open the extension`;
    }
  }
  if (typeof err === "string" && err.trim()) return `${prefix}${err}`;
  return `${prefix}failed — Rabby on Ethereum Sepolia with Sepolia ETH? Open Rabby icon for a stuck popup.`;
}

function fail(step: string, err: unknown): never {
  throw new Error(ethProviderErrorMessage(err, step));
}

export async function ensureEthChain(
  ethereum: EthereumProvider,
  cfg: Pick<
    EvmBridgeConfig,
    "chainId" | "chainName" | "ethRpcUrl" | "nativeSymbol" | "explorerTxBase"
  >,
): Promise<void> {
  const hexId = `0x${cfg.chainId.toString(16)}`;
  let current: string;
  try {
    current = (await ethereum.request({ method: "eth_chainId" })) as string;
  } catch (e) {
    fail("chainId", e);
  }
  if (Number(BigInt(current)) === cfg.chainId) return;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (e) {
    const code = (e as { code?: number })?.code;
    if (code !== 4902) fail("switch-chain", e);
    const explorer = cfg.explorerTxBase.replace(/\/tx\/?$/, "");
    try {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: cfg.chainName,
            nativeCurrency: {
              name: cfg.nativeSymbol,
              symbol: cfg.nativeSymbol,
              decimals: 18,
            },
            rpcUrls: [
              cfg.ethRpcUrl ||
                Object.values(EVM_CHAIN_PRESETS).find((p) => p.chainId === cfg.chainId)
                  ?.defaultRpc ||
                "",
            ].filter(Boolean),
            blockExplorerUrls: explorer ? [explorer] : [],
          },
        ],
      });
    } catch (addErr) {
      fail("add-chain", addErr);
    }
  }
}

export async function connectEthAccount(ethereum: EthereumProvider): Promise<string> {
  try {
    const accounts = (await ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];
    const a = accounts[0];
    if (!a) throw new Error("No Ethereum account selected in Rabby");
    return a;
  } catch (e) {
    fail("connect", e);
  }
}

/**
 * Mint (if MockUSDC) → approve → lock for pix1 recipient.
 * Returns the lock transaction hash.
 */
export async function lockUsdcWithInjectedWallet(params: {
  ethereum: EthereumProvider;
  cfg: EvmBridgeConfig;
  humanUsd: number;
  pixelRecipient: string;
  /** When true and tip exposes mock USDC, mint to the locker first (testnet only). */
  mintIfMock?: boolean;
}): Promise<{ txHash: string; salt: Hex; amountRaw: bigint }> {
  if (!(params.humanUsd > 0)) throw new Error("amount must be > 0");
  const cfg = {
    ...params.cfg,
    ethRpcUrl:
      params.cfg.ethRpcUrl ||
      Object.values(EVM_CHAIN_PRESETS).find((p) => p.chainId === params.cfg.chainId)?.defaultRpc ||
      "",
  };

  // Connect first so Rabby always opens a prompt before chain/tx steps.
  const account = await connectEthAccount(params.ethereum);
  await ensureEthChain(params.ethereum, cfg);

  const amountRaw = BigInt(Math.round(params.humanUsd * 1e6));
  const salt = bytesToHex(randomBytes(32)) as Hex;

  if (!cfg.usdcContract) {
    throw new Error("Tip did not publish USDC token address — set PIXEL_EVM_USDC");
  }

  if (params.mintIfMock) {
    try {
      await params.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: account,
            to: cfg.usdcContract,
            data: encodeMintCalldata(account, amountRaw),
          },
        ],
      });
    } catch (e) {
      // MockUSDC mint is public; if user rejects, stop — don't silently continue.
      const msg = ethProviderErrorMessage(e);
      if (/reject|denied|4001/i.test(msg)) fail("mint", e);
      /* non-mock token: continue; approve will fail clearly */
    }
  }

  try {
    await params.ethereum.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: account,
          to: cfg.usdcContract,
          data: encodeApproveCalldata(cfg.lockContract, amountRaw),
        },
      ],
    });
  } catch (e) {
    fail("approve", e);
  }

  let txHash: string;
  try {
    txHash = (await params.ethereum.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: account,
          to: cfg.lockContract,
          data: encodeLockCalldata({
            amountRaw,
            pixelRecipient: params.pixelRecipient,
            salt,
          }),
        },
      ],
    })) as string;
  } catch (e) {
    fail("lock", e);
  }

  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new Error("lock: wallet returned no tx hash");
  }

  return { txHash, salt, amountRaw };
}

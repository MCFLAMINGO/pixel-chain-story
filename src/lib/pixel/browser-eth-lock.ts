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
  const eth = window.ethereum;
  if (!eth) return window.rabby ?? null;
  const many = eth.providers?.filter((p) => typeof p?.request === "function") ?? [];
  if (many.length > 0) {
    return (
      many.find((p) => p.isRabby) ||
      window.rabby ||
      many.find((p) => p.isMetaMask) ||
      many[0] ||
      null
    );
  }
  return eth;
}

/** Injected wallets often throw plain `{ code, message }` — not always `Error`. */
export function ethProviderErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown; data?: { message?: unknown } };
    if (typeof o.message === "string" && o.message.trim()) {
      if (o.code === 4001 || /user rejected|rejected the request/i.test(o.message)) {
        return "Wallet: you rejected — approve mint → approve → lock (3 prompts)";
      }
      if (o.code === 4902) return "Wallet: add Ethereum Sepolia, then try again";
      if (o.code === -32002) return "Wallet: a request is already pending — open Rabby / MetaMask";
      return o.message;
    }
    if (typeof o.data?.message === "string" && o.data.message.trim()) return o.data.message;
    if (o.code === 4001) return "Wallet: you rejected the request";
  }
  if (typeof err === "string" && err.trim()) return err;
  return "EVM lock failed — Rabby on Ethereum Sepolia with Sepolia ETH for gas?";
}

export async function ensureEthChain(
  ethereum: EthereumProvider,
  cfg: Pick<
    EvmBridgeConfig,
    "chainId" | "chainName" | "ethRpcUrl" | "nativeSymbol" | "explorerTxBase"
  >,
): Promise<void> {
  const hexId = `0x${cfg.chainId.toString(16)}`;
  const current = (await ethereum.request({ method: "eth_chainId" })) as string;
  if (Number(BigInt(current)) === cfg.chainId) return;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (e) {
    const code = (e as { code?: number })?.code;
    if (code !== 4902) throw e;
    const explorer = cfg.explorerTxBase.replace(/\/tx\/?$/, "");
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
              Object.values(EVM_CHAIN_PRESETS).find((p) => p.chainId === cfg.chainId)?.defaultRpc ||
              "",
          ].filter(Boolean),
          blockExplorerUrls: explorer ? [explorer] : [],
        },
      ],
    });
  }
}

export async function connectEthAccount(ethereum: EthereumProvider): Promise<string> {
  const accounts = (await ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];
  const a = accounts[0];
  if (!a) throw new Error("No Ethereum account");
  return a;
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
  try {
    if (!(params.humanUsd > 0)) throw new Error("amount must be > 0");
    const cfg = {
      ...params.cfg,
      ethRpcUrl:
        params.cfg.ethRpcUrl ||
        Object.values(EVM_CHAIN_PRESETS).find((p) => p.chainId === params.cfg.chainId)
          ?.defaultRpc ||
        "",
    };
    await ensureEthChain(params.ethereum, cfg);
    const account = await connectEthAccount(params.ethereum);
    const amountRaw = BigInt(Math.round(params.humanUsd * 1e6));
    const salt = bytesToHex(randomBytes(32)) as Hex;

    if (params.mintIfMock && cfg.usdcContract) {
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
      } catch {
        /* mint may fail if not MockUSDC — continue; approve will fail clearly */
      }
    }

    if (!cfg.usdcContract) {
      throw new Error("Tip did not publish USDC token address — set PIXEL_EVM_USDC");
    }

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

    const txHash = (await params.ethereum.request({
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

    return { txHash, salt, amountRaw };
  } catch (err) {
    throw new Error(ethProviderErrorMessage(err));
  }
}

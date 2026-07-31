/**
 * Browser helper: lock MockUSDC into PixelUsdcLock via injected ethereum (MetaMask).
 * Phone Safari without an injected wallet: paste a lock tx hash instead (WalletConnect later).
 */

import {
  encodeApproveCalldata,
  encodeLockCalldata,
  encodeMintCalldata,
  type SepoliaBridgeConfig,
} from "./eth-usdc-lock";
import { bytesToHex, randomBytes, type Hex } from "./crypto";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getInjectedEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export async function ensureEthChain(
  ethereum: EthereumProvider,
  chainId: number,
): Promise<void> {
  const hexId = `0x${chainId.toString(16)}`;
  const current = (await ethereum.request({ method: "eth_chainId" })) as string;
  if (Number(BigInt(current)) === chainId) return;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (e) {
    const code = (e as { code?: number })?.code;
    if (code === 4902 && chainId === 11155111) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: "Sepolia",
            nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
      return;
    }
    throw e;
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
  cfg: SepoliaBridgeConfig;
  humanUsd: number;
  pixelRecipient: string;
  /** When true and tip exposes mock USDC, mint to the locker first (testnet only). */
  mintIfMock?: boolean;
}): Promise<{ txHash: string; salt: Hex; amountRaw: bigint }> {
  if (!(params.humanUsd > 0)) throw new Error("amount must be > 0");
  await ensureEthChain(params.ethereum, params.cfg.chainId);
  const account = await connectEthAccount(params.ethereum);
  const amountRaw = BigInt(Math.round(params.humanUsd * 1e6));
  const salt = bytesToHex(randomBytes(32)) as Hex;

  if (params.mintIfMock && params.cfg.usdcContract) {
    try {
      await params.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: account,
            to: params.cfg.usdcContract,
            data: encodeMintCalldata(account, amountRaw),
          },
        ],
      });
    } catch {
      /* mint may fail if not MockUSDC — continue; approve will fail clearly */
    }
  }

  if (!params.cfg.usdcContract) {
    throw new Error("Tip did not publish USDC token address — set PIXEL_USDC_TOKEN_SEPOLIA");
  }

  await params.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: account,
        to: params.cfg.usdcContract,
        data: encodeApproveCalldata(params.cfg.lockContract, amountRaw),
      },
    ],
  });

  const txHash = (await params.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: account,
        to: params.cfg.lockContract,
        data: encodeLockCalldata({
          amountRaw,
          pixelRecipient: params.pixelRecipient,
          salt,
        }),
      },
    ],
  })) as string;

  return { txHash, salt, amountRaw };
}

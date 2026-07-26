import { useCallback, useEffect, useState } from "react";
import {
  clearPeopleWalletBlob,
  fetchTipBalance,
  forgeAndPersistPeopleWallet,
  loadPeopleWalletBlob,
  payOnSharedTip,
  toPayFace,
  unlockStoredPeopleWallet,
  type PayFace,
} from "@/lib/pixel/people-wallet";
import type { TipMarkReceipt } from "@/lib/pixel/tip-mark";
import type { UnlockedSource } from "@/lib/pixel/custody";
import { defaultPixelRpc } from "@/lib/pixel-rpc";
import { shineInForPhoneWallet, type WalletBridgeAsset } from "@/lib/pixel/wallet-bridge";

export type BridgeReceipt = {
  plane: "shared_tip" | "lab_local";
  pixCredited: number;
  tipIndex: number;
  balance: number;
  summary: string;
  canvasId: string | null;
  asset: WalletBridgeAsset;
  humanUsd: number;
};

/**
 * Browser people wallet — sealed Personal Source + pay face + tip balance + tip pay + bridge.
 */
export function usePeopleWallet(rpcOverride?: string) {
  const rpc = rpcOverride ?? defaultPixelRpc();
  const [payFace, setPayFace] = useState<PayFace | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [tipIndex, setTipIndex] = useState<number | undefined>();
  const [unlocked, setUnlocked] = useState(false);
  const [session, setSession] = useState<UnlockedSource | null>(null);
  const [lastPay, setLastPay] = useState<TipMarkReceipt | null>(null);
  const [lastBridge, setLastBridge] = useState<BridgeReceipt | null>(null);
  const [tipBridgeLab, setTipBridgeLab] = useState<boolean | null>(null);

  const refreshBalance = useCallback(
    async (address: string) => {
      if (!rpc) {
        setBalance(null);
        setTipIndex(undefined);
        setTipBridgeLab(null);
        return;
      }
      const tip = await fetchTipBalance(rpc, address);
      if (!tip) {
        setBalance(null);
        return;
      }
      setBalance(tip.amount);
      setTipIndex(tip.tipIndex);
      try {
        const h = await fetch(`${rpc.replace(/\/$/, "")}/health`);
        if (h.ok) {
          const j = (await h.json()) as { bridgeLab?: boolean };
          setTipBridgeLab(Boolean(j.bridgeLab));
        }
      } catch {
        setTipBridgeLab(null);
      }
    },
    [rpc],
  );

  useEffect(() => {
    const blob = loadPeopleWalletBlob();
    if (blob) {
      setPayFace(toPayFace(blob.source));
      void refreshBalance(blob.source.address);
    }
    setReady(true);
  }, [refreshBalance]);

  const forge = useCallback(
    async (localId: string) => {
      setBusy(true);
      setError(null);
      try {
        const { payFace: face, unlocked: u } = await forgeAndPersistPeopleWallet(
          localId.trim() || "you",
        );
        setPayFace(face);
        setSession(u);
        setUnlocked(true);
        await refreshBalance(face.address);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Forge failed");
      } finally {
        setBusy(false);
      }
    },
    [refreshBalance],
  );

  const unlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await unlockStoredPeopleWallet();
      if (!r) {
        setError("No wallet on this device");
        return;
      }
      setPayFace(toPayFace(r.source));
      setSession(r.unlocked);
      setUnlocked(true);
      await refreshBalance(r.source.address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlock failed");
      setUnlocked(false);
      setSession(null);
    } finally {
      setBusy(false);
    }
  }, [refreshBalance]);

  const pay = useCallback(
    async (toAddress: string, amount: number, note?: string) => {
      if (!rpc) throw new Error("No tip RPC — open with ?rpc= or set VITE_PIXEL_RPC");
      if (!session) throw new Error("Unlock first — vault stays sealed until you unlock");
      setBusy(true);
      setError(null);
      setLastPay(null);
      try {
        const { tipMark } = await payOnSharedTip({
          rpc,
          unlocked: session,
          toAddress,
          amount,
          note,
        });
        setLastPay(tipMark);
        await refreshBalance(session.keypair.address);
        return tipMark;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Pay failed";
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [rpc, session, refreshBalance],
  );

  const bridgeIn = useCallback(
    async (asset: WalletBridgeAsset, humanUsd: number) => {
      if (!payFace) throw new Error("Forge a wallet first");
      setBusy(true);
      setError(null);
      setLastBridge(null);
      try {
        const res = await shineInForPhoneWallet({
          rpc,
          asset,
          humanUsd,
          ownerAddress: payFace.address,
          ownerLocalId: payFace.localId,
        });
        const receipt: BridgeReceipt = {
          plane: res.plane,
          pixCredited: res.pixCredited,
          tipIndex: res.tipIndex,
          balance: res.balance,
          summary: res.summary,
          canvasId: res.canvasId,
          asset,
          humanUsd,
        };
        setLastBridge(receipt);
        if (res.plane === "shared_tip") {
          await refreshBalance(payFace.address);
        }
        return receipt;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Bridge failed";
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [payFace, rpc, refreshBalance],
  );

  const clear = useCallback(() => {
    clearPeopleWalletBlob();
    setPayFace(null);
    setBalance(null);
    setTipIndex(undefined);
    setUnlocked(false);
    setSession(null);
    setLastPay(null);
    setLastBridge(null);
    setError(null);
  }, []);

  return {
    ready,
    busy,
    error,
    payFace,
    balance,
    tipIndex,
    unlocked,
    lastPay,
    lastBridge,
    tipBridgeLab,
    rpc: rpc ?? null,
    forge,
    unlock,
    pay,
    bridgeIn,
    clear,
    refresh: payFace ? () => refreshBalance(payFace.address) : async () => {},
  };
}

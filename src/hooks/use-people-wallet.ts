import { useCallback, useEffect, useState } from "react";
import {
  clearPeopleWalletBlob,
  fetchTipBalance,
  forgeAndPersistPeopleWallet,
  loadPeopleWalletBlob,
  toPayFace,
  unlockStoredPeopleWallet,
  type PayFace,
} from "@/lib/pixel/people-wallet";
import { defaultPixelRpc } from "@/lib/pixel-rpc";

/**
 * Browser people wallet — sealed Personal Source + pay face + tip balance.
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

  const refreshBalance = useCallback(
    async (address: string) => {
      if (!rpc) {
        setBalance(null);
        setTipIndex(undefined);
        return;
      }
      const tip = await fetchTipBalance(rpc, address);
      if (!tip) {
        setBalance(null);
        return;
      }
      setBalance(tip.amount);
      setTipIndex(tip.tipIndex);
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
        const { payFace: face } = await forgeAndPersistPeopleWallet(localId.trim() || "you");
        setPayFace(face);
        setUnlocked(true); // freshly forged session
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
      setUnlocked(true);
      await refreshBalance(r.source.address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlock failed");
      setUnlocked(false);
    } finally {
      setBusy(false);
    }
  }, [refreshBalance]);

  const clear = useCallback(() => {
    clearPeopleWalletBlob();
    setPayFace(null);
    setBalance(null);
    setTipIndex(undefined);
    setUnlocked(false);
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
    rpc: rpc ?? null,
    forge,
    unlock,
    clear,
    refresh: payFace ? () => refreshBalance(payFace.address) : async () => {},
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PEOPLE_WALLET_IDLE_LOCK_MS,
  claimTipFaucet,
  clearPeopleWalletBlob,
  enableDeviceUnlock,
  exportPeopleWalletBackup,
  fetchTipBalance,
  forgeAndPersistPeopleWallet,
  importPeopleWalletBackup,
  isPinSealedBlob,
  loadPeopleWalletBlobAsync,
  payFaceFromBlob,
  payOnSharedTip,
  unlockStoredPeopleWallet,
  unlockStoredPeopleWalletWithDevice,
  type PayFace,
} from "@/lib/pixel/people-wallet";
import type { TipMarkReceipt } from "@/lib/pixel/tip-mark";
import type { UnlockedSource } from "@/lib/pixel/custody";
import { defaultPixelRpc } from "@/lib/pixel-rpc";
import { shineInForPhoneWallet, type WalletBridgeAsset } from "@/lib/pixel/wallet-bridge";
import { CROWNED_GENESIS_PREFIX, isCrownedGenesisHash } from "@/lib/pixel/crowned-genesis";
import { webAuthnPrfSupported } from "@/lib/pixel/people-wallet-webauthn";

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
 * Browser people wallet — PIN-sealed + IndexedDB + idle lock + optional WebAuthn.
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
  const [seed, setSeed] = useState<Uint8Array | null>(null);
  const [lastPay, setLastPay] = useState<TipMarkReceipt | null>(null);
  const [lastBridge, setLastBridge] = useState<BridgeReceipt | null>(null);
  const [tipBridgeLab, setTipBridgeLab] = useState<boolean | null>(null);
  const [tipFaucet, setTipFaucet] = useState<boolean | null>(null);
  const [crownedTip, setCrownedTip] = useState<boolean | null>(null);
  const [faucetNote, setFaucetNote] = useState<string | null>(null);
  const [needsPinUpgrade, setNeedsPinUpgrade] = useState(false);
  const [pinSealed, setPinSealed] = useState(false);
  const [deviceUnlockOn, setDeviceUnlockOn] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    setUnlocked(false);
    setSession(null);
    setSeed(null);
  }, []);

  const bumpIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => lock(), PEOPLE_WALLET_IDLE_LOCK_MS);
  }, [lock]);

  useEffect(() => {
    if (!unlocked) {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      return;
    }
    bumpIdle();
    const onAct = () => bumpIdle();
    window.addEventListener("pointerdown", onAct);
    window.addEventListener("keydown", onAct);
    return () => {
      window.removeEventListener("pointerdown", onAct);
      window.removeEventListener("keydown", onAct);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [unlocked, bumpIdle]);

  const refreshBalance = useCallback(
    async (address: string) => {
      if (!rpc) {
        setBalance(null);
        setTipIndex(undefined);
        setTipBridgeLab(null);
        setTipFaucet(null);
        setCrownedTip(null);
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
          const j = (await h.json()) as {
            bridgeLab?: boolean;
            faucet?: boolean;
            genesisHash?: string;
          };
          setTipBridgeLab(Boolean(j.bridgeLab));
          setTipFaucet(Boolean(j.faucet ?? j.bridgeLab));
          setCrownedTip(isCrownedGenesisHash(j.genesisHash));
        }
      } catch {
        setTipBridgeLab(null);
        setTipFaucet(null);
        setCrownedTip(null);
      }
    },
    [rpc],
  );

  useEffect(() => {
    void (async () => {
      const blob = await loadPeopleWalletBlobAsync();
      if (blob) {
        setPayFace(payFaceFromBlob(blob));
        setPinSealed(isPinSealedBlob(blob));
        setNeedsPinUpgrade(blob.v === 1);
        setDeviceUnlockOn(blob.v === 2 && !!blob.webauthn);
        void refreshBalance(payFaceFromBlob(blob).address);
      }
      setReady(true);
    })();
  }, [refreshBalance]);

  const forge = useCallback(
    async (localId: string, pin: string) => {
      setBusy(true);
      setError(null);
      try {
        const {
          payFace: face,
          unlocked: u,
          seed: s,
        } = await forgeAndPersistPeopleWallet(localId.trim() || "you", pin);
        setPayFace(face);
        setSession(u);
        setSeed(s);
        setUnlocked(true);
        setPinSealed(true);
        setNeedsPinUpgrade(false);
        setDeviceUnlockOn(false);
        await refreshBalance(face.address);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Forge failed");
      } finally {
        setBusy(false);
      }
    },
    [refreshBalance],
  );

  const unlock = useCallback(
    async (pin: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await unlockStoredPeopleWallet(pin);
        if (!r) {
          setError("No wallet on this device");
          return;
        }
        setPayFace(r.payFace);
        setSession(r.unlocked);
        setSeed(r.seed);
        setUnlocked(true);
        setPinSealed(true);
        await refreshBalance(r.payFace.address);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unlock failed");
        lock();
      } finally {
        setBusy(false);
      }
    },
    [refreshBalance, lock],
  );

  const unlockDevice = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await unlockStoredPeopleWalletWithDevice();
      if (!r) {
        setError("No wallet on this device");
        return;
      }
      setPayFace(r.payFace);
      setSession(r.unlocked);
      setSeed(r.seed);
      setUnlocked(true);
      setDeviceUnlockOn(true);
      await refreshBalance(r.payFace.address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Device unlock failed");
      lock();
    } finally {
      setBusy(false);
    }
  }, [refreshBalance, lock]);

  const enableBiometric = useCallback(async () => {
    if (!seed || !payFace) throw new Error("Unlock with PIN first");
    setBusy(true);
    setError(null);
    try {
      await enableDeviceUnlock({
        seed,
        address: payFace.address,
        localId: payFace.localId,
      });
      setDeviceUnlockOn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable device unlock");
      throw e;
    } finally {
      setBusy(false);
    }
  }, [seed, payFace]);

  const exportBackup = useCallback(() => {
    const json = exportPeopleWalletBackup();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pixel-wallet-backup-${payFace?.address.slice(0, 10) ?? "hold"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [payFace]);

  const importBackup = useCallback(
    async (json: string, pin: string) => {
      setBusy(true);
      setError(null);
      try {
        const face = await importPeopleWalletBackup(json, pin);
        setPayFace(face);
        setPinSealed(true);
        setNeedsPinUpgrade(false);
        lock();
        await refreshBalance(face.address);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [lock, refreshBalance],
  );

  const pay = useCallback(
    async (toAddress: string, amount: number, note?: string) => {
      if (!rpc) throw new Error("No tip RPC — open with ?rpc= or set VITE_PIXEL_RPC");
      if (!session) throw new Error("Unlock with PIN first — vault stays sealed");
      setBusy(true);
      setError(null);
      setLastPay(null);
      bumpIdle();
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
    [rpc, session, refreshBalance, bumpIdle],
  );

  const faucet = useCallback(async () => {
    if (!rpc) throw new Error("No tip RPC");
    if (!payFace) throw new Error("Forge a wallet first");
    setBusy(true);
    setError(null);
    setFaucetNote(null);
    try {
      const out = await claimTipFaucet({ rpc, address: payFace.address });
      setFaucetNote(out.summary);
      await refreshBalance(payFace.address);
      return out;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Faucet failed";
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [rpc, payFace, refreshBalance]);

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
    lock();
    setLastPay(null);
    setLastBridge(null);
    setFaucetNote(null);
    setNeedsPinUpgrade(false);
    setPinSealed(false);
    setDeviceUnlockOn(false);
    setError(null);
  }, [lock]);

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
    tipFaucet,
    crownedTip,
    crownedPrefix: CROWNED_GENESIS_PREFIX,
    faucetNote,
    needsPinUpgrade,
    pinSealed,
    deviceUnlockOn,
    webAuthnAvailable: webAuthnPrfSupported(),
    rpc: rpc ?? null,
    forge,
    unlock,
    unlockDevice,
    enableBiometric,
    exportBackup,
    importBackup,
    lock,
    pay,
    faucet,
    bridgeIn,
    clear,
    refresh: payFace ? () => refreshBalance(payFace.address) : async () => {},
  };
}

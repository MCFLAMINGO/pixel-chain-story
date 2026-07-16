import { useCallback, useEffect, useState } from "react";
import {
  balanceOf,
  createDemoWallet,
  createGenesis,
  encodeHexAsLight,
  humanSummary,
  proposeTransfer,
  sequenceBlock,
  simulateCameraCapture,
  verifyCapturedPattern,
  verifyChain,
  type LightKeypair,
  type OpticalPattern,
  type PixelChainState,
  type Transaction,
} from "@/lib/pixel";

export type PixelWallet = LightKeypair & { label: string };

export function usePixelChain() {
  const [alice, setAlice] = useState<PixelWallet | null>(null);
  const [bob, setBob] = useState<PixelWallet | null>(null);
  const [chain, setChain] = useState<PixelChainState | null>(null);
  const [busy, setBusy] = useState(true);
  const [phase, setPhase] = useState("Igniting genesis light…");
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [valid, setValid] = useState(true);
  const [revealing, setRevealing] = useState(false);
  const [optical, setOptical] = useState<OpticalPattern | null>(null);
  const [opticalOk, setOpticalOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        setPhase("Forging quantum-resistant light keys…");
        const a = await createDemoWallet("Alice");
        const b = await createDemoWallet("Bob");
        if (cancelled) return;
        setPhase("First light — genesis revelation…");
        const genesis = await createGenesis(a);
        if (cancelled) return;
        setAlice(a);
        setBob(b);
        setChain(genesis);
        setHistory(genesis.pixels.flatMap((block) => block.transactions));
        setValid(await verifyChain(genesis));
        setPhase("Ready. Propose a transfer — it stays both until light reveals it.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start Pixel");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const propose = useCallback(
    async (amount: number, memo: string) => {
      if (!chain || !alice || !bob) return;
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Enter a positive amount");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const { state, tx } = await proposeTransfer(
          chain,
          alice,
          [{ amount, address: bob.address }],
          {
            description: memo,
            reference: `PIX-${Date.now()}`,
            recipientLabel: "@bob",
          },
        );
        setChain(state);
        setLastTx(tx);
        setPhase(humanSummary(tx, alice.address));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transfer failed");
      } finally {
        setBusy(false);
      }
    },
    [alice, bob, chain],
  );

  const shineLight = useCallback(async () => {
    if (!chain || chain.pending.length === 0) {
      setError("Nothing in superposition — propose a transfer first");
      return;
    }
    setBusy(true);
    setRevealing(true);
    setError(null);
    try {
      if (!alice) throw new Error("No sequencer key");
      const next = await sequenceBlock(chain, alice);
      const tip = next.pixels[next.pixels.length - 1];
      const tx = tip.transactions[0];
      setChain(next);
      setLastTx(tx);
      setHistory((h) => [...h, ...tip.transactions]);
      setValid(await verifyChain(next));
      setPhase(humanSummary(tx, alice?.address));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revelation failed");
    } finally {
      setBusy(false);
      window.setTimeout(() => setRevealing(false), 1000);
    }
  }, [alice?.address, chain]);

  const projectKey = useCallback(async () => {
    if (!alice) return;
    setBusy(true);
    setError(null);
    try {
      const pattern = await encodeHexAsLight(alice.seed);
      setOptical(pattern);
      setOpticalOk(null);
      setPhase("Screen light projected — the picture holds the key.");
    } finally {
      setBusy(false);
    }
  }, [alice]);

  const captureKey = useCallback(async () => {
    if (!optical) return;
    setBusy(true);
    try {
      const captured = simulateCameraCapture(optical, 0);
      const result = await verifyCapturedPattern(captured, optical.checksum);
      setOpticalOk(result.ok);
      setPhase(
        result.ok
          ? "Camera read the light — key recovered intact."
          : "Optical capture failed checksum.",
      );
    } finally {
      setBusy(false);
    }
  }, [optical]);

  /** Apply chain state from Lumen / RPC execution (real settlement). */
  const applyChain = useCallback(async (next: PixelChainState, note?: string) => {
    setChain(next);
    setHistory(next.pixels.flatMap((b) => b.transactions));
    const tip = next.pixels[next.pixels.length - 1];
    if (tip?.transactions[0]) setLastTx(tip.transactions[0]);
    setValid(await verifyChain(next));
    if (note) setPhase(note);
  }, []);

  return {
    alice,
    bob,
    chain,
    busy,
    phase,
    lastTx,
    history,
    valid,
    revealing,
    optical,
    opticalOk,
    error,
    aliceBal: chain && alice ? balanceOf(chain, alice.address) : 0,
    bobBal: chain && bob ? balanceOf(chain, bob.address) : 0,
    pending: chain?.pending.length ?? 0,
    propose,
    shineLight,
    projectKey,
    captureKey,
    applyChain,
  };
}

import { useEffect, useState } from "react";
import {
  LockFeeder,
  balanceOf,
  createGenesis,
  forgePersonalSource,
  generateLightKeypair,
  illuminateIngress,
  ingressApplication,
  ingressDomain,
  ingressTreasury,
  worldlightThesis,
  type ContinuityRecord,
  type FeederState,
  type LocalUsdcRail,
  type PersonalSource,
  type PixelChainState,
} from "@/lib/pixel";

/** How $5, mcflamingo.com, and a corp treasury actually enter — via live lock feeder. */
export function WorldlightPanel() {
  const thesis = worldlightThesis();
  const [you, setYou] = useState<PersonalSource | null>(null);
  const [vault, setVault] = useState<Awaited<ReturnType<typeof generateLightKeypair>> | null>(null);
  const [state, setState] = useState<PixelChainState | null>(null);
  const [rail, setRail] = useState<LocalUsdcRail | null>(null);
  const [feeder, setFeeder] = useState<FeederState | null>(null);
  const [log, setLog] = useState("");
  const [continuity, setContinuity] = useState<ContinuityRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [bal, setBal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const person = await forgePersonalSource("you");
      const bridgeVault = await generateLightKeypair();
      const genesis = await createGenesis(bridgeVault);
      const localRail = LockFeeder.createRail();
      LockFeeder.mintUsdc(localRail, "0xYouEOA", 100);
      if (cancelled) return;
      setYou(person.source);
      setVault(bridgeVault);
      setState(genesis);
      setRail(localRail);
      setFeeder(LockFeeder.createState());
      setLog(
        "Personal Source forged. USDC rail funded (100 USDC). Bridge escrow ready. Lock → feed → shineIn.",
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shineUsdc = async (humanUsd: number) => {
    if (!you || !vault || !state || !rail || !feeder) return;
    setBusy(true);
    try {
      const receipt = await LockFeeder.lockUsdc({
        rail,
        locker: "0xYouEOA",
        humanUsd,
        pixelRecipient: you.address,
      });
      const prepared = await LockFeeder.feed({
        receipt,
        ownerLocalId: "you",
        feeder,
        rail,
      });
      const res = await illuminateIngress({
        prepared,
        state,
        bridgeVault: vault,
        sequencer: vault,
      });
      LockFeeder.consume(feeder, receipt.lockDigest);
      setState(res.state);
      setFeeder({ ...feeder, consumed: new Set(feeder.consumed) });
      setContinuity(res.continuity);
      const b = balanceOf(res.state, you.address);
      setBal(b);
      setLog(
        `USDC lock ${receipt.foreignRef}\n` +
          `raw ${receipt.amountRaw} · digest ${receipt.lockDigest.slice(0, 16)}…\n` +
          `${res.summary}\nYour PIX: ${b}`,
      );
    } catch (e) {
      setLog(e instanceof Error ? e.message : "USDC feed failed");
    } finally {
      setBusy(false);
    }
  };

  const shineWire = async (humanUsd: number) => {
    if (!you || !vault || !state || !feeder) return;
    setBusy(true);
    try {
      const attestor = await LockFeeder.createBankAttestor("mcflamingo-bank");
      const receipt = await LockFeeder.attestWire({
        attestor,
        humanUsd,
        pixelRecipient: you.address,
        wireRef: `WIRE-${Date.now()}`,
      });
      const prepared = await LockFeeder.feed({
        receipt,
        ownerLocalId: "you",
        feeder,
        attestor,
      });
      const res = await illuminateIngress({
        prepared,
        state,
        bridgeVault: vault,
        sequencer: vault,
      });
      LockFeeder.consume(feeder, receipt.lockDigest);
      setState(res.state);
      setFeeder({ ...feeder, consumed: new Set(feeder.consumed) });
      setContinuity(res.continuity);
      const b = balanceOf(res.state, you.address);
      setBal(b);
      setLog(`Bank wire ${receipt.foreignRef}\n` + `${res.summary}\nYour PIX: ${b}`);
    } catch (e) {
      setLog(e instanceof Error ? e.message : "wire feed failed");
    } finally {
      setBusy(false);
    }
  };

  const runContinuity = async (label: string, prepare: () => ReturnType<typeof ingressDomain>) => {
    if (!you || !vault || !state) return;
    setBusy(true);
    try {
      const prepared = await prepare();
      const res = await illuminateIngress({
        prepared,
        state,
        bridgeVault: vault,
        sequencer: vault,
      });
      setState(res.state);
      setContinuity(res.continuity);
      setBal(balanceOf(res.state, you.address));
      setLog(`${label}\n${res.summary}`);
    } catch (e) {
      setLog(e instanceof Error ? e.message : "ingress failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="worldlight" className="pixel-rise">
      <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
        Worldlight · lock feeder
      </p>
      <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        Lock dollars. Shine in.
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Wired feeder: USDC lock rail (≡ Solidity PixelUsdcLock) or bank-wire attestation → verified
        receipt → PIX on your Personal Source. No fake string “locks.”
      </p>

      <ul className="mt-6 max-w-2xl space-y-3 text-sm text-muted-foreground">
        <li>
          <span className="font-pixel text-foreground">USDC / wire</span> — {thesis.usd}
        </li>
        <li>
          <span className="font-pixel text-foreground">mcflamingo.com</span> — {thesis.domain}
        </li>
        <li>
          <span className="font-pixel text-foreground">Corp bank</span> — {thesis.treasury}
        </li>
        <li>
          <span className="font-pixel text-foreground">App</span> — {thesis.facebook}
        </li>
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !you}
          onClick={() => void shineUsdc(5)}
          className="font-pixel rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          Lock $5 USDC → shine in
        </button>
        <button
          type="button"
          disabled={busy || !you}
          onClick={() => void shineWire(5)}
          className="font-pixel rounded-md border border-primary/50 px-4 py-2 text-xs font-semibold"
        >
          Attest $5 bank wire → shine in
        </button>
        <button
          type="button"
          disabled={busy || !you}
          onClick={() =>
            void runContinuity("mcflamingo.com", () =>
              ingressDomain("https://mcflamingo.com", {
                address: you!.address,
                localId: "you",
              }),
            )
          }
          className="font-pixel rounded-md border border-border px-4 py-2 text-xs font-semibold"
        >
          Shine in mcflamingo.com (domain record)
        </button>
        <a
          href="/shine"
          className="font-pixel inline-flex items-center rounded-md border border-primary/50 px-4 py-2 text-xs font-semibold"
        >
          Shine in (your brand) →
        </a>
        <a
          href="/continuity"
          className="font-pixel inline-flex items-center rounded-md border border-border px-4 py-2 text-xs font-semibold"
        >
          Continuity desk →
        </a>
        <button
          type="button"
          disabled={busy || !you}
          onClick={() =>
            void runContinuity("treasury", () =>
              ingressTreasury("McFlamingo Corp Treasury", "iban-hash-demo-mcflamingo", {
                address: you!.address,
                localId: "you",
              }),
            )
          }
          className="font-pixel rounded-md border border-border px-4 py-2 text-xs font-semibold"
        >
          Shine in corp treasury
        </button>
        <button
          type="button"
          disabled={busy || !you}
          onClick={() =>
            void runContinuity("app", () =>
              ingressApplication(
                "McFlamingo",
                "https://app.mcflamingo.com",
                { address: you!.address, localId: "you" },
                ["typescript", "rust"],
                ["ipfs://mcflamingo-mirror-1"],
              ),
            )
          }
          className="font-pixel rounded-md border border-border px-4 py-2 text-xs font-semibold"
        >
          Shine in app
        </button>
      </div>

      {you && (
        <p className="font-pixel mt-6 text-xs text-muted-foreground">
          Your Source: {you.address.slice(0, 20)}… · PIX: {bal}
          {rail ? ` · USDC rail locked raw: ${rail.lockedRaw}` : ""}
        </p>
      )}
      {continuity && (
        <p className="mt-2 text-sm text-primary">
          Continuity: {continuity.artifact.name} · {continuity.state}
          {continuity.illuminatedAtPixel !== undefined
            ? ` · pixel #${continuity.illuminatedAtPixel}`
            : ""}
        </p>
      )}
      {log && (
        <pre className="mt-4 max-w-2xl whitespace-pre-wrap border border-border bg-background/70 p-3 text-sm">
          {log}
        </pre>
      )}
    </section>
  );
}

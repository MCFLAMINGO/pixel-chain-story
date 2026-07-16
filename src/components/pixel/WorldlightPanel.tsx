import { useEffect, useState } from "react";
import {
  balanceOf,
  createGenesis,
  forgePersonalSource,
  generateLightKeypair,
  illuminateIngress,
  ingressApplication,
  ingressDomain,
  ingressTreasury,
  ingressUsd,
  worldlightThesis,
  type ContinuityRecord,
  type PersonalSource,
  type PixelChainState,
} from "@/lib/pixel";

/** How $5, mcflamingo.com, and a corp treasury actually enter. */
export function WorldlightPanel() {
  const thesis = worldlightThesis();
  const [you, setYou] = useState<PersonalSource | null>(null);
  const [vault, setVault] = useState<Awaited<ReturnType<typeof generateLightKeypair>> | null>(null);
  const [state, setState] = useState<PixelChainState | null>(null);
  const [log, setLog] = useState("");
  const [continuity, setContinuity] = useState<ContinuityRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [bal, setBal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const person = await forgePersonalSource("you");
      const bridgeVault = await generateLightKeypair();
      // Fund escrow from genesis so $ shine-in can release PIX
      const genesis = await createGenesis(bridgeVault);
      if (cancelled) return;
      setYou(person.source);
      setVault(bridgeVault);
      setState(genesis);
      setLog(
        "Personal Source forged. Bridge escrow funded at genesis. Pick what to shine in — your seed never leaves you.",
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (label: string, prepare: () => ReturnType<typeof ingressUsd>) => {
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
      setLog(`${label}\n${res.summary}\nYour PIX balance: ${balanceOf(res.state, you.address)}`);
    } catch (e) {
      setLog(e instanceof Error ? e.message : "ingress failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="worldlight" className="pixel-rise">
      <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
        Worldlight · ingress
      </p>
      <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        $5. Your site. Your treasury.
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Theory is cheap. This is the door: dollars shine in to your Personal Source; domains and
        apps come into the light without a second Facebook; corporate treasury binds to owners —
        spends still Kindling.
      </p>

      <ul className="mt-6 max-w-2xl space-y-3 text-sm text-muted-foreground">
        <li>
          <span className="font-pixel text-foreground">$5 USD</span> — {thesis.usd}
        </li>
        <li>
          <span className="font-pixel text-foreground">mcflamingo.com</span> — {thesis.domain}
        </li>
        <li>
          <span className="font-pixel text-foreground">Corp bank</span> — {thesis.treasury}
        </li>
        <li>
          <span className="font-pixel text-foreground">App / “Facebook”</span> — {thesis.facebook}
        </li>
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !you}
          onClick={() =>
            void run("$5 USD", () =>
              ingressUsd(5, { address: you!.address, localId: "you" }, "demo-wire-5usd"),
            )
          }
          className="font-pixel rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          Shine in $5
        </button>
        <button
          type="button"
          disabled={busy || !you}
          onClick={() =>
            void run("mcflamingo.com", () =>
              ingressDomain("https://mcflamingo.com", {
                address: you!.address,
                localId: "you",
              }),
            )
          }
          className="font-pixel rounded-md border border-border px-4 py-2 text-xs font-semibold"
        >
          Shine in mcflamingo.com
        </button>
        <button
          type="button"
          disabled={busy || !you}
          onClick={() =>
            void run("treasury", () =>
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
            void run("app", () =>
              ingressApplication(
                "McFlamingo",
                "https://app.mcflamingo.com",
                { address: you!.address, localId: "you" },
                ["typescript", "rust"],
                ["ipfs://mcflamingo-mirror-1"],
              ),
            )
          }
          className="font-pixel rounded-md border border-primary/40 px-4 py-2 text-xs font-semibold"
        >
          Shine in app (no 2nd Facebook)
        </button>
      </div>

      {you && (
        <p className="font-pixel mt-6 text-xs text-muted-foreground">
          Your Source: {you.address.slice(0, 20)}… · PIX on ledger: {bal}
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

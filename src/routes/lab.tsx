import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AccessDemo } from "@/components/pixel/AccessDemo";
import { ExecutionConsole } from "@/components/pixel/ExecutionConsole";
import { KindlingPanel } from "@/components/pixel/KindlingPanel";
import { WorldlightPanel } from "@/components/pixel/WorldlightPanel";
import { LumenPanel } from "@/components/pixel/LumenPanel";
import { OpticalPanel } from "@/components/pixel/OpticalPanel";
import { RealityField } from "@/components/pixel/RealityField";
import { TransferDeck } from "@/components/pixel/TransferDeck";
import { usePixelChain } from "@/hooks/use-pixel-chain";
import { EXPRESSION_AXIOM, datacenterRebuke, estimatePoLSCost } from "@/lib/pixel";

/** Builder / protocol lab — not the public face. The site face is `/` (billboard). */
export const Route = createFileRoute("/lab")({
  head: () => ({
    meta: [
      { title: "PIXEL lab" },
      {
        name: "description",
        content: "Kindling, Worldlight, Lumen — protocol lab behind the live field.",
      },
    ],
  }),
  component: Lab,
});

function Lab() {
  const pixel = usePixelChain();
  const [amount, setAmount] = useState("250");
  const [memo, setMemo] = useState("For a lighter world");
  const energy = estimatePoLSCost();
  const blocks = pixel.chain?.pixels ?? [];

  return (
    <main className="min-h-screen overflow-x-hidden text-foreground">
      <div className="mx-auto max-w-5xl px-6 pt-10">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to="/"
            className="font-pixel text-xs tracking-[0.28em] text-primary uppercase underline-offset-4 hover:underline"
          >
            ← Live field
          </Link>
          <Link
            to="/doors"
            className="font-pixel text-xs tracking-[0.28em] text-primary uppercase underline-offset-4 hover:underline"
          >
            Doors
          </Link>
          <Link
            to="/continuity"
            className="font-pixel text-xs tracking-[0.28em] text-primary uppercase underline-offset-4 hover:underline"
          >
            Continuity desk →
          </Link>
        </div>
        <h1 className="font-pixel mt-6 text-4xl font-bold tracking-tight md:text-5xl">Lab</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          SISO — Build anywhere. Shine in once. No second you. Build on / for / into Pixel. Map:{" "}
          <Link to="/doors" className="text-primary underline-offset-4 hover:underline">
            /doors
          </Link>
          . Agents: docs/AGENTS-SISO.md. {EXPRESSION_AXIOM}
        </p>
        <p className="font-pixel mt-4 text-xs tracking-widest text-muted-foreground uppercase">
          On · For · Into
        </p>
      </div>

      <div className="mx-auto max-w-5xl space-y-28 px-6 py-16">
        <section id="field" className="pixel-rise">
          <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
            Color-field / action / zip
          </p>
          <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
            They saw the matrix. We execute it.
          </h2>
          <div className="mt-8">
            <RealityField pixels={blocks} pendingCount={pixel.pending} />
          </div>
        </section>

        <WorldlightPanel />
        <KindlingPanel />
        <AccessDemo />

        <TransferDeck
          aliceBal={pixel.aliceBal}
          bobBal={pixel.bobBal}
          aliceAddress={pixel.alice?.address}
          bobAddress={pixel.bob?.address}
          amount={amount}
          memo={memo}
          busy={pixel.busy}
          pending={pixel.pending}
          revealing={pixel.revealing}
          phase={pixel.phase}
          error={pixel.error}
          lastTx={pixel.lastTx}
          history={pixel.history}
          onAmount={setAmount}
          onMemo={setMemo}
          onPropose={() => pixel.propose(Math.floor(Number(amount)), memo)}
          onReveal={() => pixel.shineLight()}
        />

        {pixel.chain && pixel.alice && pixel.bob && (
          <ExecutionConsole
            chain={pixel.chain}
            setChain={(c) => {
              void pixel.applyChain(c, "Lumen execution painted the field");
            }}
            alice={pixel.alice}
            bob={pixel.bob}
          />
        )}

        <OpticalPanel
          pattern={pixel.optical}
          ok={pixel.opticalOk}
          busy={pixel.busy}
          onProject={() => pixel.projectKey()}
          onCapture={() => pixel.captureKey()}
          onCameraCapture={(cells) => pixel.captureKeyFromCells(cells)}
        />

        <LumenPanel
          chain={pixel.chain}
          alice={pixel.alice}
          bob={pixel.bob}
          onChain={(c, note) => void pixel.applyChain(c, note)}
        />

        <section className="pixel-rise border-t border-border pt-16">
          <h2 className="font-pixel text-3xl font-bold tracking-tight">
            Scarcity · Sovereignty · Shine
          </h2>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{datacenterRebuke()}</p>
          <ul className="mt-6 max-w-2xl list-disc space-y-3 pl-5 text-muted-foreground">
            <li>
              <span className="text-foreground">21,000,000 PIX</span> — scarcity schedule; light
              rewards ({energy.model}).
            </li>
            <li>
              <span className="text-foreground">Sovereign nodes</span> — diversity policy enforced
              when ≥7 providers are registered (local lab skips).
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}

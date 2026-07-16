import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ExecutionConsole } from "@/components/pixel/ExecutionConsole";
import { LedgerField } from "@/components/pixel/LedgerField";
import { OpticalPanel } from "@/components/pixel/OpticalPanel";
import { RealityField } from "@/components/pixel/RealityField";
import { TransferDeck } from "@/components/pixel/TransferDeck";
import { usePixelChain } from "@/hooks/use-pixel-chain";
import { EXPRESSION_AXIOM, estimatePoLSCost } from "@/lib/pixel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PIXEL — light renders reality" },
      {
        name: "description",
        content:
          "Quantum-resistant ledger where light reveals proximity and color is absent without it. Abstract Expressionism as information transfer. Executable — not theory.",
      },
      { property: "og:title", content: "PIXEL — light renders reality" },
      {
        property: "og:description",
        content:
          "PoLS settlement, Lumen programs, optical keys, and a ledger that paints like the Abstract Expressionists saw the matrix.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const pixel = usePixelChain();
  const [amount, setAmount] = useState("250");
  const [memo, setMemo] = useState("For a lighter world");
  const energy = estimatePoLSCost();
  const blocks = pixel.chain?.pixels ?? [];

  return (
    <main className="min-h-screen overflow-x-hidden text-foreground">
      <section className="pixel-hero-light relative min-h-[100svh]">
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden>
          {pixels.length > 0 ? (
            <LedgerField
              blocks={blocks}
              pendingCount={pixel.pending}
              className="h-full min-h-[100svh] w-full [&>div]:min-h-[100svh]"
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_40%_30%,oklch(0.2_0.03_145),oklch(0.1_0.02_145))]" />
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />

        <div className="relative mx-auto flex min-h-[100svh] max-w-5xl flex-col justify-end px-6 pb-16 pt-24 md:pb-24">
          <div className="pixel-rise max-w-2xl">
            <p className="font-pixel text-xs font-semibold tracking-[0.4em] text-primary uppercase">
              Reality rendering protocol
            </p>
            <h1 className="font-pixel mt-5 text-[clamp(4.5rem,18vw,9.5rem)] leading-[0.85] font-extrabold tracking-tight">
              PIXEL
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-foreground/90 md:text-xl">
              The Abstract Expressionists had the key: information moves as field and gesture
              through void. Light reveals proximity. Color is absent without it.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="#field"
                className="font-pixel inline-flex rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Enter the field
              </a>
              <a
                href="#console"
                className="font-pixel text-sm font-semibold underline decoration-primary/40 underline-offset-4"
              >
                Execute Lumen
              </a>
            </div>
            <p className="mt-8 max-w-md text-xs leading-relaxed text-muted-foreground">
              {EXPRESSION_AXIOM}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-28 px-6 py-24">
        <section id="field" className="pixel-rise">
          <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
            Color-field / action / zip
          </p>
          <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
            They saw the matrix. We execute it.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Rothko: the color <em>is</em> the message. Pollock: each revelation is a drip on the
            canvas of time. Newman: light zips through void. Click a lit pixel — proximity appears.
            Unlit remains colorless.
          </p>
          <div className="mt-8">
            <RealityField blocks={blocks} pendingCount={pixel.pending} />
          </div>
        </section>

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
        />

        <section className="pixel-rise border-t border-border pt-16">
          <h2 className="font-pixel text-3xl font-bold tracking-tight">
            Scarcity · Sovereignty · Shine
          </h2>
          <ul className="mt-6 max-w-2xl list-disc space-y-3 pl-5 text-muted-foreground">
            <li>
              <span className="text-foreground">21,000,000 PIX</span> hard cap — Bitcoin’s scarcity
              math; issuance by illuminating pixels, not burning coal ({energy.model}).
            </li>
            <li>
              <span className="text-foreground">Sovereign nodes</span> — diversity caps so
              AWS/Cloudflare/single-nation majorities cannot be the kill switch.
            </li>
            <li>
              <span className="text-foreground">Agnostic bridges</span> — Universal Light
              Attestations shine onto Ethereum, Bitcoin, Cosmos, Solana, ICP… without becoming
              anyone’s L2.
            </li>
            <li>Post-quantum hash-OTS · Lumen · JSON-RPC · optical keys.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

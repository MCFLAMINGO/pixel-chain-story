import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  balanceOf,
  createDemoWallet,
  createGenesis,
  encodeHexAsLight,
  estimatePoLSCost,
  humanSummary,
  patternToCssGrid,
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PIXEL — blockchain with light as its backbone" },
      {
        name: "description",
        content:
          "Quantum-resistant, energy-saving UTXO chain. Transactions stay in superposition until Proof of Light Sequence reveals them. Screen light can hold the key.",
      },
      { property: "og:title", content: "PIXEL — light-backed blockchain" },
      {
        property: "og:description",
        content:
          "Real transfers. Hash-based quantum-resistant signatures. Proof of Light Sequence. Optical keys from your phone screen.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [alice, setAlice] = useState<(LightKeypair & { label: string }) | null>(null);
  const [bob, setBob] = useState<(LightKeypair & { label: string }) | null>(null);
  const [chain, setChain] = useState<PixelChainState | null>(null);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("Igniting genesis light…");
  const [amount, setAmount] = useState("100");
  const [memo, setMemo] = useState("Contribution toward a lighter energy future");
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  const [valid, setValid] = useState(true);
  const [revealing, setRevealing] = useState(false);
  const [optical, setOptical] = useState<OpticalPattern | null>(null);
  const [opticalOk, setOpticalOk] = useState<boolean | null>(null);
  const energy = useMemo(() => estimatePoLSCost(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        setStatus("Generating quantum-resistant light keys…");
        const a = await createDemoWallet("Alice");
        const b = await createDemoWallet("Bob");
        if (cancelled) return;
        setStatus("Creating genesis revelation…");
        const genesis = await createGenesis(a);
        if (cancelled) return;
        setAlice(a);
        setBob(b);
        setChain(genesis);
        setValid(await verifyChain(genesis));
        setStatus("Ready — propose a real transfer");
      } catch (err) {
        console.error(err);
        setStatus(err instanceof Error ? err.message : "Failed to start Pixel");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const aliceBal = chain && alice ? balanceOf(chain, alice.address) : 0;
  const bobBal = chain && bob ? balanceOf(chain, bob.address) : 0;

  const propose = async () => {
    if (!chain || !alice || !bob) return;
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) {
      setStatus("Enter a positive amount");
      return;
    }
    setBusy(true);
    try {
      const { state, tx } = await proposeTransfer(
        chain,
        alice,
        [{ amount: n, address: bob.address }],
        {
          description: memo,
          reference: `PIX-${Date.now()}`,
          recipientLabel: "@bob",
        },
      );
      setChain(state);
      setLastTx(tx);
      setStatus(humanSummary(tx, alice.address));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  };

  const shineLight = async () => {
    if (!chain || chain.pending.length === 0) {
      setStatus("Nothing in superposition — propose a transfer first");
      return;
    }
    setBusy(true);
    setRevealing(true);
    try {
      const next = await sequenceBlock(chain);
      setChain(next);
      const tip = next.blocks[next.blocks.length - 1];
      const tx = tip.transactions[0];
      setLastTx(tx);
      setValid(await verifyChain(next));
      setStatus(humanSummary(tx, alice?.address));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Revelation failed");
    } finally {
      setBusy(false);
      setTimeout(() => setRevealing(false), 900);
    }
  };

  const projectKey = async () => {
    if (!alice) return;
    setBusy(true);
    try {
      const pattern = await encodeHexAsLight(alice.seed);
      setOptical(pattern);
      setOpticalOk(null);
      setStatus("Screen light projected — the picture holds the key");
    } finally {
      setBusy(false);
    }
  };

  const captureKey = async () => {
    if (!optical) return;
    setBusy(true);
    try {
      const captured = simulateCameraCapture(optical, 0);
      const result = await verifyCapturedPattern(captured, optical.checksum);
      setOpticalOk(result.ok);
      setStatus(
        result.ok
          ? "Camera read the light — key recovered intact"
          : "Optical capture failed checksum",
      );
    } finally {
      setBusy(false);
    }
  };

  const cols = Math.max(8, Math.ceil(Math.sqrt(chain?.blocks.length ?? 1)));

  return (
    <main className="pixel-hero-light min-h-screen text-foreground">
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-16 md:pt-24">
        <header className="pixel-rise">
          <p className="font-pixel text-xs font-semibold tracking-[0.35em] text-primary uppercase">
            Light protocol
          </p>
          <h1 className="font-pixel mt-4 text-6xl font-extrabold tracking-tight text-foreground md:text-8xl">
            PIXEL
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            A blockchain for humanity where light — digital, optical, sequential — collapses truth
            into real settlements. No mining farms. No blind hashes as the product.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#ledger"
              className="font-pixel inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Open the ledger
            </a>
            <a
              href="#optical"
              className="font-pixel inline-flex items-center rounded-md border border-border bg-background/50 px-5 py-2.5 text-sm font-semibold backdrop-blur transition hover:bg-accent"
            >
              Project a key with light
            </a>
          </div>
        </header>

        <section id="ledger" className="pixel-rise mt-20" style={{ animationDelay: "120ms" }}>
          <h2 className="font-pixel text-2xl font-bold tracking-tight">Live ledger</h2>
          <p className="mt-2 text-muted-foreground">
            Real UTXO balances. Propose stays in superposition until light reveals it.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <WalletPanel name="Alice" address={alice?.address} balance={aliceBal} />
            <WalletPanel name="Bob" address={bob?.address} balance={bobBal} />
          </div>

          <div className="mt-6 space-y-3">
            <label className="block text-sm text-muted-foreground">
              Amount (PIX)
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-foreground outline-none ring-ring focus:ring-2"
              />
            </label>
            <label className="block text-sm text-muted-foreground">
              Human-readable memo (signed on-chain)
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-foreground outline-none ring-ring focus:ring-2"
              />
            </label>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={busy || !chain}
                onClick={propose}
                className="font-pixel rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Propose transfer
              </button>
              <button
                type="button"
                disabled={busy || !chain?.pending.length}
                onClick={shineLight}
                className="font-pixel rounded-md border border-border bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                Shine light (PoLS)
              </button>
              <span
                className={`ml-auto self-center rounded-full px-3 py-1 text-xs font-medium ${
                  valid ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                }`}
              >
                {valid ? "Chain valid" : "Chain broken"}
              </span>
            </div>
            <p className={`text-sm text-muted-foreground ${revealing ? "pixel-reveal" : ""}`}>
              {status}
            </p>
            {lastTx && (
              <p className="text-xs text-muted-foreground">
                txid <code className="font-mono">{lastTx.txid.slice(0, 24)}…</code> · state{" "}
                <strong>{lastTx.state}</strong>
                {chain && chain.pending.length > 0 ? ` · pending ${chain.pending.length}` : ""}
              </p>
            )}
          </div>

          <div className="mt-8">
            <p className="font-pixel text-sm font-semibold tracking-wide uppercase">
              Chain as picture
            </p>
            <div
              className="mt-3 grid gap-[3px] rounded-md border border-border bg-background/40 p-3"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {(chain?.blocks ?? []).map((b) => (
                <div
                  key={b.hash}
                  title={`#${b.index} seq=${b.sequence}`}
                  className="aspect-square rounded-[2px]"
                  style={{
                    backgroundColor: `rgb(${b.color.r}, ${b.color.g}, ${b.color.b})`,
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {chain?.blocks.length ?? 0} blocks · tip{" "}
              <code className="font-mono">
                {chain?.blocks[chain.blocks.length - 1]?.hash.slice(0, 16)}…
              </code>
            </p>
          </div>
        </section>

        <section id="optical" className="pixel-rise mt-20" style={{ animationDelay: "200ms" }}>
          <h2 className="font-pixel text-2xl font-bold tracking-tight">Optical key</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            No new coding language — light intensity is the structure. Your screen projects a
            picture; that picture carries key bytes. A camera (or a second open screen) reads it
            back. Flashlight helps outdoors; screen phosphor works indoors.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || !alice}
              onClick={projectKey}
              className="font-pixel rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Shine key from screen
            </button>
            <button
              type="button"
              disabled={busy || !optical}
              onClick={captureKey}
              className="font-pixel rounded-md border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Simulate camera capture
            </button>
            {opticalOk !== null && (
              <span className="self-center text-sm text-muted-foreground">
                {opticalOk ? "Key recovered ✓" : "Capture failed"}
              </span>
            )}
          </div>
          {optical && (
            <div
              className="pixel-reveal mt-6 grid max-w-xs gap-[2px] rounded-md border border-border p-2 shadow-[0_0_40px_oklch(0.9_0.08_85/0.35)]"
              style={{ gridTemplateColumns: `repeat(${optical.width}, 1fr)` }}
            >
              {patternToCssGrid(optical).map((color, i) => (
                <div key={i} className="aspect-square" style={{ backgroundColor: color }} />
              ))}
            </div>
          )}
        </section>

        <section
          className="pixel-rise mt-20 border-t border-border pt-10"
          style={{ animationDelay: "280ms" }}
        >
          <h2 className="font-pixel text-2xl font-bold tracking-tight">Why this saves energy</h2>
          <p className="mt-3 text-muted-foreground">{energy.model}</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>{energy.relativeToPoW}</li>
            <li>{energy.relativeToPoS}</li>
            <li>{energy.note}</li>
            <li>
              You do not invent a new programming language — you define a Light Protocol on top of
              TypeScript today, Rust tomorrow.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function WalletPanel({
  name,
  address,
  balance,
}: {
  name: string;
  address?: string;
  balance: number;
}) {
  return (
    <div className="rounded-md border border-border bg-card/80 px-4 py-4 backdrop-blur">
      <p className="font-pixel text-sm font-semibold">{name}</p>
      <p className="mt-2 font-pixel text-3xl font-bold tracking-tight">
        {balance.toLocaleString()} PIX
      </p>
      <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">{address ?? "…"}</p>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  createGenesis,
  mineBlock,
  verifyChain,
  type PixelBlock,
} from "@/lib/pixel-chain";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pixel Chain — a blockchain drawn as a picture" },
      {
        name: "description",
        content:
          "A minimal proof-of-concept where every block in the chain is a single pixel. Tampering with any pixel breaks the picture.",
      },
      { property: "og:title", content: "Pixel Chain" },
      {
        property: "og:description",
        content: "A blockchain rendered as a picture — every block is a pixel.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [chain, setChain] = useState<PixelBlock[]>(() => {
    const g = createGenesis();
    let c = [g];
    // Pre-mine a small starter chain so the picture has something to show.
    for (let i = 0; i < 63; i++) {
      c = [...c, mineBlock(c[c.length - 1], Math.floor(Math.random() * 256))];
    }
    return c;
  });
  const [tampered, setTampered] = useState(false);

  const valid = useMemo(() => verifyChain(chain), [chain]);
  const cols = 16;

  const addBlock = () => {
    const data = Math.floor(Math.random() * 256);
    setChain((c) => [...c, mineBlock(c[c.length - 1], data)]);
    setTampered(false);
  };

  const tamper = () => {
    if (chain.length < 2) return;
    const i = Math.floor(chain.length / 2);
    const next = chain.map((b, idx) =>
      idx === i ? { ...b, color: { r: 255, g: 0, b: 128 } } : b,
    );
    setChain(next);
    setTampered(true);
  };

  const reset = () => {
    const g = createGenesis();
    let c = [g];
    for (let i = 0; i < 63; i++) {
      c = [...c, mineBlock(c[c.length - 1], Math.floor(Math.random() * 256))];
    }
    setChain(c);
    setTampered(false);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Pixel Chain</h1>
        <p className="mt-3 text-muted-foreground">
          A tiny blockchain where every block is a single pixel. Each pixel's
          color is derived from its data plus the previous pixel's hash, so the
          whole picture is the ledger.
        </p>

        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <div
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {chain.map((b) => (
              <div
                key={b.index}
                title={`#${b.index} data=${b.data} hash=${b.hash}`}
                className="aspect-square rounded-[2px]"
                style={{
                  backgroundColor: `rgb(${b.color.r}, ${b.color.g}, ${b.color.b})`,
                }}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={addBlock}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Mine pixel
            </button>
            <button
              onClick={tamper}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Tamper with a pixel
            </button>
            <button
              onClick={reset}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Reset
            </button>
            <span
              className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${
                valid
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-destructive text-destructive-foreground"
              }`}
            >
              {valid ? "Chain valid" : "Chain broken"}
            </span>
          </div>

          {tampered && !valid && (
            <p className="mt-4 text-sm text-muted-foreground">
              A pixel was edited by hand. Its color no longer matches its hash,
              so verification fails — the picture itself is the proof.
            </p>
          )}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Length: {chain.length} blocks · Tip hash:{" "}
          <code className="font-mono">{chain[chain.length - 1].hash}</code>
        </p>
      </div>
    </main>
  );
}

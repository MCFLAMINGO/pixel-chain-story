import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LedgerField } from "@/components/pixel/LedgerField";
import { usePixelChain } from "@/hooks/use-pixel-chain";
import { type LedgerPixel } from "@/lib/pixel";

/**
 * Times Square / public screen mode.
 * Full-bleed picture of the ledger filling with light.
 *
 *   /billboard
 *   /billboard?rpc=http://127.0.0.1:8545   ← live node feed
 */
export const Route = createFileRoute("/billboard")({
  head: () => ({
    meta: [
      { title: "PIXEL — live field" },
      {
        name: "description",
        content: "Watch the Pixel Ledger illuminate — the public picture of settlement.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    rpc: typeof s.rpc === "string" ? s.rpc : undefined,
  }),
  component: BillboardPage,
});

function BillboardPage() {
  const { rpc } = Route.useSearch();
  const local = usePixelChain();
  const [remote, setRemote] = useState<LedgerPixel[] | null>(null);
  const [pending, setPending] = useState(0);
  const [tip, setTip] = useState<string>("");
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!rpc) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const base = rpc.replace(/\/$/, "");
        const pixels = (await fetch(`${base}/pixels`).then((r) => r.json())) as LedgerPixel[];
        const health = (await fetch(`${base}/health`).then((r) => r.json())) as {
          pending?: number;
        };
        if (cancelled) return;
        setRemote(pixels);
        setPending(health.pending ?? 0);
        const last = pixels[pixels.length - 1];
        setTip(last ? `#${last.index}` : "—");
        setLive(true);
      } catch {
        if (!cancelled) setLive(false);
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [rpc]);

  const pixels = remote ?? local.chain?.pixels ?? [];
  const pendingCount = remote ? pending : local.pending;
  const countLabel = remote ? tip : local.chain ? `#${local.chain.pixels.length - 1}` : "…";

  return (
    <main className="fixed inset-0 overflow-hidden bg-[oklch(0.08_0.02_145)] text-foreground">
      <div className="absolute inset-0">
        <LedgerField
          pixels={pixels}
          pendingCount={pendingCount}
          fit="cinema"
          className="h-full min-h-[100svh] w-full"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/30" />

      <header className="absolute inset-x-0 top-0 flex items-start justify-between px-8 pt-8 md:px-14 md:pt-12">
        <div>
          <p className="font-pixel text-xs font-semibold tracking-[0.45em] text-primary uppercase">
            Live field
          </p>
          <h1 className="font-pixel mt-2 text-[clamp(3rem,12vw,8rem)] leading-none font-extrabold tracking-tight">
            PIXEL
          </h1>
        </div>
        <div className="font-pixel text-right text-sm md:text-base">
          <p className="tracking-[0.2em] text-muted-foreground uppercase">
            {rpc ? (live ? "node feed" : "connecting…") : "local genesis"}
          </p>
          <p className="mt-2 text-3xl font-bold md:text-5xl">{countLabel}</p>
          <p className="mt-1 text-muted-foreground">
            {pixels.filter((p) => p.illuminated).length} lit
            {pendingCount > 0 ? ` · ${pendingCount} waiting` : ""}
          </p>
        </div>
      </header>

      <footer className="absolute inset-x-0 bottom-0 px-8 pb-8 md:px-14 md:pb-12">
        <p className="font-pixel max-w-xl text-sm text-foreground/80 md:text-lg">
          Genesis fills the frame. As more light arrives, the camera pulls back — the mosaic of
          humanity. Color is absent without light.
        </p>
      </footer>
    </main>
  );
}

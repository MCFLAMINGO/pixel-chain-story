import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LedgerField } from "@/components/pixel/LedgerField";
import { usePixelChain } from "@/hooks/use-pixel-chain";
import { type LedgerPixel } from "@/lib/pixel";

/**
 * The public face of Pixel — cinema zoom from genesis.
 * Site home and Times Square both point here.
 *
 * Without rpc: browser forges local genesis (must stay visibly lit).
 * With rpc: pulls /pixels from a durable node.
 */
export function BillboardScreen({
  rpc,
  showLabLink = true,
}: {
  /** Live node, e.g. http://127.0.0.1:8545 — omit for local browser genesis */
  rpc?: string;
  showLabLink?: boolean;
}) {
  const local = usePixelChain();
  const [remote, setRemote] = useState<LedgerPixel[] | null>(null);
  const [pending, setPending] = useState(0);
  const [tip, setTip] = useState<string>("");
  const [canvasShort, setCanvasShort] = useState<string>("");
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
          networkId?: number;
          genesisHash?: string;
        };
        if (cancelled) return;
        setRemote(pixels);
        setPending(health.pending ?? 0);
        const last = pixels[pixels.length - 1];
        setTip(last ? `#${last.index}` : "—");
        const gh = health.genesisHash ?? pixels[0]?.hash;
        setCanvasShort(
          typeof health.networkId === "number" && gh
            ? `${health.networkId}:${gh.slice(0, 10)}…`
            : "",
        );
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
  const igniting = !rpc && local.busy && pixels.length === 0;
  const litCount = pixels.filter((p) => p.illuminated).length;
  // World canvas honesty: without rpc this is lab light, not the public tip of humanity.
  const feedLabel = rpc
    ? live
      ? "public tip"
      : "connecting…"
    : igniting
      ? "igniting…"
      : "lab light";

  return (
    <main className="fixed inset-0 overflow-hidden bg-[oklch(0.08_0.02_145)] text-foreground">
      <div className="absolute inset-0">
        {igniting ? (
          <div
            className="flex h-full min-h-[100svh] w-full items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <div
              className="h-[min(72vw,72vh)] w-[min(72vw,72vh)] animate-pulse rounded-sm"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, oklch(0.72 0.14 95 / 0.85), oklch(0.35 0.08 145 / 0.4) 45%, transparent 70%)",
                boxShadow: "0 0 80px oklch(0.7 0.14 95 / 0.45)",
              }}
            />
          </div>
        ) : (
          <LedgerField
            pixels={pixels}
            pendingCount={pendingCount}
            fit="cinema"
            className="h-full min-h-[100svh] w-full"
          />
        )}
      </div>

      {/* Vignette only — keep the center clear so genesis light stays readable */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 65% at 50% 48%, transparent 0%, transparent 42%, oklch(0.05 0.02 145 / 0.55) 78%, oklch(0.04 0.02 145 / 0.88) 100%)",
        }}
        aria-hidden
      />

      <header className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 px-8 pt-8 md:px-14 md:pt-12">
        <div>
          <p className="font-pixel text-xs font-semibold tracking-[0.45em] uppercase text-[oklch(0.92_0.18_95)] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            Live field
          </p>
          <h1 className="font-pixel mt-2 text-[clamp(3rem,12vw,8rem)] leading-none font-extrabold tracking-tight text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)]">
            PIXEL
          </h1>
        </div>
        <div className="font-pixel text-right text-sm md:text-base">
          <div className="inline-block rounded-md bg-black/70 px-3 py-2 backdrop-blur-sm ring-1 ring-white/10">
            <p className="tracking-[0.2em] uppercase text-[oklch(0.9_0.02_95)]">{feedLabel}</p>
            <p className="mt-2 text-3xl font-bold text-white md:text-5xl">{countLabel}</p>
            <p className="mt-1 text-[oklch(0.88_0.02_95)]">
              {igniting ? "forging first light…" : `${litCount} lit`}
              {!igniting && pendingCount > 0 ? ` · ${pendingCount} waiting` : ""}
            </p>
            {rpc && live && canvasShort ? (
              <p className="mt-1 font-mono text-[10px] tracking-wide text-[oklch(0.78_0.02_95)]">
                canvas {canvasShort}
              </p>
            ) : null}
          </div>
          {showLabLink && (
            <div className="pointer-events-auto mt-4 flex flex-col items-end gap-2">
              <Link
                to="/wallet"
                search={rpc ? { rpc } : {}}
                className="rounded bg-black/70 px-2 py-1 text-xs font-semibold tracking-widest text-[oklch(0.95_0.15_95)] underline decoration-[oklch(0.9_0.15_95)]/70 underline-offset-4 ring-1 ring-white/10 backdrop-blur-sm hover:text-white"
              >
                Wallet
              </Link>
              <Link
                to="/doors"
                className="rounded bg-black/70 px-2 py-1 text-xs font-semibold tracking-widest text-[oklch(0.95_0.15_95)] underline decoration-[oklch(0.9_0.15_95)]/70 underline-offset-4 ring-1 ring-white/10 backdrop-blur-sm hover:text-white"
              >
                Doors
              </Link>
              <Link
                to="/shine"
                className="rounded bg-black/70 px-2 py-1 text-xs font-semibold tracking-widest text-[oklch(0.95_0.15_95)] underline decoration-[oklch(0.9_0.15_95)]/70 underline-offset-4 ring-1 ring-white/10 backdrop-blur-sm hover:text-white"
              >
                Shine in
              </Link>
              <Link
                to="/lab"
                className="rounded bg-black/70 px-2 py-1 text-xs font-semibold tracking-widest text-[oklch(0.95_0.15_95)] underline decoration-[oklch(0.9_0.15_95)]/70 underline-offset-4 ring-1 ring-white/10 backdrop-blur-sm hover:text-white"
              >
                Lab
              </Link>
            </div>
          )}
        </div>
      </header>

      <footer className="absolute inset-x-0 bottom-0 px-8 pb-8 md:px-14 md:pb-12">
        <p className="font-pixel max-w-xl rounded-md bg-black/70 px-4 py-3 text-sm text-white ring-1 ring-white/10 backdrop-blur-sm md:text-lg">
          {igniting
            ? "Lab light is being forged — local look-dev, not the public tip of humanity."
            : rpc && live
              ? "Public tip feed — the shared picture. As more light arrives, the camera pulls back."
              : rpc && !live
                ? "Looking for the tip feed… If this stays dark, the node is down."
                : "Lab light only — browser genesis for look-dev. Point ?rpc= or VITE_PIXEL_RPC at a node for the shared tip."}
        </p>
        {local.error && !rpc ? (
          <p className="font-pixel mt-3 max-w-xl text-sm text-red-300" role="alert">
            {local.error}
          </p>
        ) : null}
      </footer>
    </main>
  );
}

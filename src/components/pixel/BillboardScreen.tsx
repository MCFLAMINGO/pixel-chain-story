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
    <main className="billboard-phone fixed inset-0 overflow-hidden bg-[oklch(0.08_0.02_145)] text-foreground">
      <div className="absolute inset-0">
        {igniting ? (
          <div
            className="flex h-full min-h-[100svh] w-full items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <div
              className="h-[min(72vw,55svh)] w-[min(72vw,55svh)] animate-pulse rounded-sm sm:h-[min(72vw,72vh)] sm:w-[min(72vw,72vh)]"
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

      <header className="absolute inset-x-0 top-0 flex flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-8 sm:pt-8 md:px-14 md:pt-12">
        <div className="min-w-0">
          <p className="font-pixel text-[10px] font-semibold tracking-[0.35em] text-[oklch(0.92_0.18_95)] uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-xs sm:tracking-[0.45em]">
            Live field
          </p>
          <h1 className="font-pixel mt-1 text-[clamp(2.5rem,14vw,8rem)] leading-none font-extrabold tracking-tight text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] sm:mt-2">
            PIXEL
          </h1>
        </div>
        <div className="font-pixel flex flex-col gap-3 sm:items-end sm:text-right sm:text-sm md:text-base">
          <div className="inline-block w-fit rounded-md bg-black/70 px-3 py-2 backdrop-blur-sm ring-1 ring-white/10">
            <p className="tracking-[0.2em] text-[oklch(0.9_0.02_95)] uppercase">{feedLabel}</p>
            <p className="mt-1 text-2xl font-bold text-white sm:mt-2 sm:text-3xl md:text-5xl">
              {countLabel}
            </p>
            <p className="mt-1 text-xs text-[oklch(0.88_0.02_95)] sm:text-sm">
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
            <nav
              className="pointer-events-auto flex flex-wrap gap-2 sm:max-w-[14rem] sm:flex-col sm:items-end"
              aria-label="Site"
            >
              {(
                [
                  ["/wallet", "Wallet", rpc ? { rpc } : {}],
                  ["/doors", "Doors", {}],
                  ["/shine", "Shine in", {}],
                  ["/lab", "Lab", {}],
                ] as const
              ).map(([to, label, search]) => (
                <Link
                  key={to}
                  to={to}
                  search={search as never}
                  className="phone-nav-link bg-black/70 text-[oklch(0.95_0.15_95)] ring-1 ring-white/10 backdrop-blur-sm"
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>

      <footer className="absolute inset-x-0 bottom-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-8 md:px-14 md:pb-12">
        <p className="font-pixel max-w-xl rounded-md bg-black/70 px-3 py-2.5 text-xs text-white ring-1 ring-white/10 backdrop-blur-sm sm:px-4 sm:py-3 sm:text-sm md:text-lg">
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

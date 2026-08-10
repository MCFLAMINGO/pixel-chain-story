import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  const local = usePixelChain({ skipLocalGenesis: Boolean(rpc) });
  const [remote, setRemote] = useState<LedgerPixel[] | null>(null);
  const [pending, setPending] = useState(0);
  const [tip, setTip] = useState<string>("");
  const [canvasShort, setCanvasShort] = useState<string>("");
  const [live, setLive] = useState(false);
  // Pixels already held, so each poll can ask only for what is new.
  const knownRef = useRef<LedgerPixel[]>([]);
  // Distinguishes "not tried yet" from "tried and failed".
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!rpc) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const base = rpc.replace(/\/$/, "");
        // Ask only for what we do not have. The first pull is the whole picture;
        // after that each poll carries the new pixels alone.
        const have = knownRef.current;
        const since = have.length > 0 ? have[have.length - 1]!.index : -1;
        const fresh = (await fetch(`${base}/pixels?since=${since}`).then((r) =>
          r.json(),
        )) as LedgerPixel[];
        // A shorter chain than ours means a different history, not a smaller one —
        // fall back to a full pull rather than stitching two pictures together.
        const pixels =
          Array.isArray(fresh) && fresh.length > 0 && fresh[0]!.index === since + 1
            ? [...have, ...fresh]
            : since >= 0 && Array.isArray(fresh) && fresh.length === 0
              ? have
              : ((await fetch(`${base}/pixels`).then((r) => r.json())) as LedgerPixel[]);
        knownRef.current = pixels;
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
            ? `${health.networkId}:${gh.slice(0, 8)}…`
            : "",
        );
        setLive(true);
      } catch {
        if (!cancelled) setLive(false);
      } finally {
        if (!cancelled) setAttempted(true);
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [rpc]);

  // Lovable injects an Edit badge that eats the phone chrome — scrub it on the field too.
  useEffect(() => {
    const scrub = () => {
      document
        .querySelectorAll("#lovable-badge, [id='lovable-badge']")
        .forEach((el) => el.remove());
    };
    scrub();
    const mo = new MutationObserver(scrub);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // A configured tip is never substituted by a local chain. Falling back showed
  // a privately forged Earth under the label "connecting…", which is the one way
  // lab light can be mistaken for the picture.
  const pixels = rpc ? (remote ?? []) : (local.chain?.pixels ?? []);
  const pendingCount = remote ? pending : rpc ? 0 : local.pending;
  const countLabel = remote
    ? tip
    : rpc
      ? "—"
      : local.chain
        ? `#${local.chain.pixels.length - 1}`
        : "…";
  const igniting = !rpc && local.busy && pixels.length === 0;
  const unreachable = Boolean(rpc) && !live && attempted;
  const litCount = pixels.filter((p) => p.illuminated).length;
  // World canvas honesty: without rpc this is lab light, not the public tip of humanity.
  const feedLabel = rpc
    ? live
      ? "public tip"
      : unreachable
        ? "tip unreachable"
        : "connecting…"
    : igniting
      ? "igniting…"
      : "lab light";

  const statusMeta = igniting
    ? "forging first light…"
    : `${litCount} lit${pendingCount > 0 ? ` · ${pendingCount} waiting` : ""}`;

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

      <header className="billboard-chrome absolute inset-x-0 top-0 z-10">
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="min-w-0">
            <p className="font-pixel text-[10px] font-semibold tracking-[0.35em] text-[oklch(0.92_0.18_95)] uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] sm:text-xs sm:tracking-[0.45em]">
              Live field
            </p>
            <h1 className="font-pixel mt-1 text-[clamp(2.75rem,16vw,8rem)] leading-none font-extrabold tracking-tight text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)]">
              PIXEL
            </h1>
          </div>

          <div className="font-pixel billboard-status min-w-0 w-full max-w-full">
            <p className="tracking-[0.18em] text-[oklch(0.9_0.02_95)] uppercase">{feedLabel}</p>
            <p className="mt-0.5 truncate text-2xl font-bold text-white sm:text-3xl md:text-5xl">
              {countLabel}
            </p>
            <p className="mt-0.5 truncate text-xs text-[oklch(0.88_0.02_95)] sm:text-sm">
              {statusMeta}
              {rpc && live && canvasShort ? ` · ${canvasShort}` : ""}
            </p>
          </div>

          {showLabLink ? (
            <nav className="billboard-nav pointer-events-auto" aria-label="Site">
              {(
                [
                  ["/wallet", "Wallet", rpc ? { rpc } : {}],
                  ["/doors", "Doors", {}],
                  ["/shine", "Shine", {}],
                  ["/lab", "Lab", {}],
                ] as const
              ).map(([to, label, search]) => (
                <Link
                  key={to}
                  to={to}
                  search={search as never}
                  className="phone-nav-link bg-black/70 text-[oklch(0.95_0.15_95)]"
                >
                  {label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <footer className="billboard-chrome absolute inset-x-0 bottom-0 z-10">
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

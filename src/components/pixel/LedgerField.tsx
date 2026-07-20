import { useMemo, useState } from "react";
import {
  cssRgb,
  isColorAbsent,
  proximityLinks,
  type ObserverMode,
  type LedgerPixel,
} from "@/lib/pixel";

/**
 * Ledger as picture: void until light; proximity only under illumination.
 *
 * fit:
 *   dense  — many small cells (default UI)
 *   cinema — Times Square zoom: genesis fills the frame, then the field
 *            pulls back as more pixels light (1 → 2 → … → thousands)
 */
export function LedgerField({
  pixels,
  className = "",
  interactive = false,
  observer = "screen",
  pendingCount = 0,
  fit = "dense",
}: {
  pixels: LedgerPixel[];
  className?: string;
  interactive?: boolean;
  observer?: ObserverMode;
  pendingCount?: number;
  fit?: "dense" | "cinema";
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const count = Math.max(pixels.length + pendingCount, 1);
  const cols =
    fit === "cinema"
      ? Math.max(1, Math.ceil(Math.sqrt(count)))
      : Math.max(12, Math.ceil(Math.sqrt(count * 1.6)));
  const rows = Math.max(1, Math.ceil(count / cols));

  const links = useMemo(() => {
    if (focus === null) return [];
    return proximityLinks(
      pixels.map((p) => ({
        index: p.index,
        illuminated: p.illuminated,
        transactions: p.transactions,
        color: p.color,
      })),
      focus,
    );
  }, [pixels, focus]);

  const linked = useMemo(() => new Set(links.map((l) => l.to)), [links]);

  const cellClass =
    fit === "cinema"
      ? "transition-all duration-700 ease-out"
      : "aspect-square min-h-[10px] transition-all duration-500";

  return (
    <div className={`${className} ${fit === "cinema" ? "flex items-center justify-center" : ""}`}>
      <div
        className={`grid gap-px bg-[oklch(0.12_0.02_145)] ${
          fit === "cinema" ? "h-[min(92vw,92vh)] w-[min(92vw,92vh)]" : ""
        }`}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: fit === "cinema" ? `repeat(${rows}, minmax(0, 1fr))` : undefined,
        }}
        aria-label="Pixel ledger field — color absent without light"
      >
        {pixels.map((pixel) => {
          const absent = !pixel.illuminated || isColorAbsent(pixel.color);
          const isFocus = focus === pixel.index;
          const isNear = linked.has(pixel.index);
          return (
            <button
              key={pixel.hash}
              type="button"
              disabled={!interactive}
              title={
                absent
                  ? `#${pixel.index} — no light, color absent`
                  : `#${pixel.index} lit · proximity ${pixel.proximity.length} · ${observer}`
              }
              onClick={() =>
                interactive && setFocus((f) => (f === pixel.index ? null : pixel.index))
              }
              className={`${cellClass} ${interactive ? "cursor-pointer" : ""} ${
                isFocus ? "z-10 scale-110" : ""
              } ${isNear ? "ring-1 ring-accent" : ""}`}
              style={{
                backgroundColor: absent ? "transparent" : cssRgb(pixel.color),
                boxShadow:
                  !absent && (isFocus || isNear)
                    ? `0 0 18px ${cssRgb(pixel.color, 0.55)}`
                    : !absent && interactive
                      ? `0 0 10px ${cssRgb(pixel.color, 0.25)}`
                      : !absent && fit === "cinema"
                        ? `0 0 40px ${cssRgb(pixel.color, 0.35)}`
                        : undefined,
                opacity: absent ? 0.15 : isNear || isFocus || focus === null ? 1 : 0.35,
              }}
            />
          );
        })}
        {Array.from({ length: pendingCount }).map((_, i) => (
          <div
            key={`ghost-${i}`}
            title="In superposition — no light, color absent, proximity hidden"
            className={`${cellClass} border border-dashed border-white/10 bg-transparent`}
          />
        ))}
      </div>
      {interactive && focus !== null && (
        <p className="mt-3 text-xs text-muted-foreground">
          Light on pixel #{focus}: proximity reveals{" "}
          {links.length === 0
            ? "no neighbors yet"
            : links
                .map((l) => `#${l.to} (${l.kind})`)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ")}
          . Without light, color is absent.
        </p>
      )}
    </div>
  );
}

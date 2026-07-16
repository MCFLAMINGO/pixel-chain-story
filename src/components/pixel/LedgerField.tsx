import { useMemo, useState } from "react";
import {
  cssRgb,
  isColorAbsent,
  proximityLinks,
  type ObserverMode,
  type PixelBlock,
} from "@/lib/pixel";

/** Ledger as picture: void until light; proximity only under illumination. */
export function LedgerField({
  blocks,
  className = "",
  interactive = false,
  observer = "screen",
  pendingCount = 0,
}: {
  blocks: PixelBlock[];
  className?: string;
  interactive?: boolean;
  observer?: ObserverMode;
  pendingCount?: number;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const count = Math.max(blocks.length, 1);
  const cols = Math.max(12, Math.ceil(Math.sqrt(count * 1.6)));

  const links = useMemo(() => {
    if (focus === null) return [];
    return proximityLinks(
      blocks.map((b) => ({
        index: b.index,
        illuminated: b.illuminated,
        transactions: b.transactions,
        color: b.color,
      })),
      focus,
    );
  }, [blocks, focus]);

  const linked = useMemo(() => new Set(links.map((l) => l.to)), [links]);

  return (
    <div className={className}>
      <div
        className="grid gap-px bg-[oklch(0.12_0.02_145)]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        aria-label="Pixel ledger field — color absent without light"
      >
        {blocks.map((block) => {
          const absent = !block.illuminated || isColorAbsent(block.color);
          const isFocus = focus === block.index;
          const isNear = linked.has(block.index);
          return (
            <button
              key={block.hash}
              type="button"
              disabled={!interactive}
              title={
                absent
                  ? `#${block.index} — no light, color absent`
                  : `#${block.index} lit · proximity ${block.proximity.length} · ${observer}`
              }
              onClick={() =>
                interactive && setFocus((f) => (f === block.index ? null : block.index))
              }
              className={`aspect-square min-h-[10px] transition-all duration-500 ${
                interactive ? "cursor-pointer" : ""
              } ${isFocus ? "scale-110 z-10" : ""} ${isNear ? "ring-1 ring-accent" : ""}`}
              style={{
                backgroundColor: absent ? "transparent" : cssRgb(block.color),
                boxShadow:
                  !absent && (isFocus || isNear)
                    ? `0 0 18px ${cssRgb(block.color, 0.55)}`
                    : !absent && interactive
                      ? `0 0 10px ${cssRgb(block.color, 0.25)}`
                      : undefined,
                opacity: absent ? 0.15 : isNear || isFocus || focus === null ? 1 : 0.35,
              }}
            />
          );
        })}
        {/* Unlit pending ghosts — present in the field but color-absent */}
        {Array.from({ length: pendingCount }).map((_, i) => (
          <div
            key={`ghost-${i}`}
            title="In superposition — no light, color absent, proximity hidden"
            className="aspect-square min-h-[10px] border border-dashed border-white/10 bg-transparent"
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

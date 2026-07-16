import { useMemo, useState } from "react";
import {
  actionPath,
  chainToRealityField,
  cssRgb,
  proximityLinks,
  type LedgerPixel,
} from "@/lib/pixel";

/**
 * Immersive Abstract Expressionist reading of the Pixel Ledger.
 * Void until light. Gesture = revelation path. Proximity only under illumination.
 */
export function RealityField({
  pixels,
  pendingCount = 0,
}: {
  pixels: LedgerPixel[];
  pendingCount?: number;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const field = useMemo(() => chainToRealityField(pixels), [pixels]);
  const path = useMemo(() => actionPath(pixels), [pixels]);
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

  const pathD =
    path.length > 0
      ? path.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * 1000} ${p.y * 560}`).join(" ")
      : "";

  return (
    <div className="relative">
      <div
        className="relative aspect-[16/10] w-full overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, oklch(0.18 0.03 145), oklch(0.08 0.02 145))",
        }}
      >
        {field.zips.map((z, i) => (
          <div
            key={`zip-${i}`}
            className="pointer-events-none absolute left-[8%] right-[8%] h-px"
            style={{
              top: `${z.y * 100}%`,
              background: `linear-gradient(90deg, transparent, oklch(0.85 0.08 85 / ${0.15 + z.intensity * 0.5}), transparent)`,
            }}
          />
        ))}

        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 1000 560"
          preserveAspectRatio="none"
        >
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="oklch(0.9 0.06 85 / 0.35)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {focus !== null &&
            links.map((l, i) => {
              const a = field.strokes.find((s) => s.index === l.from);
              const b = field.strokes.find((s) => s.index === l.to);
              if (!a || !b) return null;
              return (
                <line
                  key={`link-${i}`}
                  x1={a.x * 1000}
                  y1={a.y * 560}
                  x2={b.x * 1000}
                  y2={b.y * 560}
                  stroke={
                    l.kind === "economic"
                      ? "oklch(0.75 0.12 155 / 0.7)"
                      : "oklch(0.85 0.08 85 / 0.55)"
                  }
                  strokeWidth={1 + l.strength * 2}
                />
              );
            })}
        </svg>

        {field.strokes.map((stroke) => {
          const isFocus = focus === stroke.index;
          const near = links.some((l) => l.to === stroke.index);
          if (!stroke.illuminated) {
            return (
              <div
                key={stroke.index}
                className="absolute rounded-full border border-white/5"
                style={{
                  left: `${stroke.x * 100}%`,
                  top: `${stroke.y * 100}%`,
                  width: 10,
                  height: 10,
                  transform: "translate(-50%, -50%)",
                  background: "transparent",
                }}
                title={`#${stroke.index} — void: color absent without light`}
              />
            );
          }
          const size = 14 + stroke.energy * 28;
          return (
            <button
              key={stroke.index}
              type="button"
              onClick={() => setFocus((f) => (f === stroke.index ? null : stroke.index))}
              title={`#${stroke.index} — color is the transfer`}
              className="absolute rounded-full transition-all duration-500"
              style={{
                left: `${stroke.x * 100}%`,
                top: `${stroke.y * 100}%`,
                width: size,
                height: size,
                transform: `translate(-50%, -50%) scale(${isFocus ? 1.35 : near ? 1.15 : 1})`,
                backgroundColor: cssRgb(stroke.color),
                boxShadow: `0 0 ${18 + stroke.energy * 40}px ${cssRgb(stroke.color, isFocus || near ? 0.65 : 0.35)}`,
                opacity: focus === null || isFocus || near ? 1 : 0.28,
              }}
            />
          );
        })}

        {pendingCount > 0 && (
          <p className="absolute right-4 bottom-4 font-pixel text-[10px] tracking-[0.2em] text-white/40 uppercase">
            {pendingCount} in superposition · color absent
          </p>
        )}
      </div>

      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
        {field.axiom}
        {focus !== null && (
          <span className="mt-2 block text-foreground">
            Light on #{focus}: proximity{" "}
            {links.length === 0
              ? "still forming"
              : links
                  .map((l) => `#${l.to} ${l.kind}`)
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .join(" · ")}
          </span>
        )}
      </p>
    </div>
  );
}

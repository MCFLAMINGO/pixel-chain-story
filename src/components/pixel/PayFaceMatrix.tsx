import { useEffect, useState } from "react";
import { type OpticalPattern } from "@/lib/pixel/optical";
import { encodePayFaceMatrix } from "@/lib/pixel/pay-face-optical";

/**
 * Projector cell colors — red channel must stay ≈ cell byte (camera decode).
 * Glow is CSS around the grid, never a remap of payload luminance.
 */
function projectorCssGrid(pattern: OpticalPattern): string[] {
  return pattern.cells.map((v) => {
    const t = Math.max(0, Math.min(255, Math.round(v)));
    return `rgb(${t}, ${Math.min(255, Math.floor(t * 0.98))}, ${Math.min(255, Math.floor(t * 0.9))})`;
  });
}

/** 16×16 pay-face Kindling matrix — public address only, never vault. */
export function PayFaceMatrix(props: {
  address: string;
  className?: string;
  /** Full-phone projector (default). */
  projector?: boolean;
  onReady?: (pattern: OpticalPattern) => void;
  onClose?: () => void;
}) {
  const [colors, setColors] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const projector = props.projector !== false;

  const onReady = props.onReady;
  useEffect(() => {
    let cancelled = false;
    setColors(null);
    setErr(null);
    void encodePayFaceMatrix(props.address)
      .then((pattern) => {
        if (cancelled) return;
        setColors(projectorCssGrid(pattern));
        onReady?.(pattern);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "matrix failed");
      });
    return () => {
      cancelled = true;
    };
  }, [props.address, onReady]);

  useEffect(() => {
    if (!projector || typeof navigator === "undefined") return;
    let wake: { release: () => Promise<void> } | null = null;
    const anyNav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    void anyNav.wakeLock
      ?.request("screen")
      .then((lock) => {
        wake = lock;
      })
      .catch(() => undefined);
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#050806";
    document.documentElement.classList.add("kindling-projecting");
    return () => {
      document.body.style.backgroundColor = prev;
      document.documentElement.classList.remove("kindling-projecting");
      void wake?.release();
    };
  }, [projector]);

  if (err) {
    return <p className="text-xs text-amber-200/90">{err}</p>;
  }
  if (!colors) {
    return (
      <p className={projector ? "kindling-projector-loading" : "text-xs text-white/40"}>
        Kindling face…
      </p>
    );
  }

  if (!projector) {
    return (
      <div
        className={props.className}
        data-optical-pay-face="1"
        role="img"
        aria-label={`Kindling pay face for ${props.address}`}
      >
        <div
          className="grid aspect-square w-full max-w-[14rem] gap-px border border-emerald-400/25 bg-black/60 p-1"
          style={{ gridTemplateColumns: "repeat(16, 1fr)" }}
        >
          {colors.map((c, i) => (
            <div key={i} style={{ background: c }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="kindling-projector"
      data-optical-pay-face="1"
      role="dialog"
      aria-modal="true"
      aria-label={`Kindling pay face for ${props.address}`}
    >
      <div className="kindling-projector-stage-wrap">
        <div className="kindling-projector-stage">
          <div className="kindling-projector-bloom" aria-hidden />
          <div className="kindling-projector-halo" aria-hidden />
          <div
            className="kindling-projector-grid"
            style={{ gridTemplateColumns: "repeat(16, 1fr)" }}
          >
            {colors.map((c, i) => (
              <div key={i} className="kindling-projector-cell" style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>
      <p className="kindling-projector-hint">Fill their camera with this square · vault sealed</p>
      <button type="button" className="kindling-projector-close" onClick={() => props.onClose?.()}>
        Hide face
      </button>
    </div>
  );
}

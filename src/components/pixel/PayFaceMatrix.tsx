import { useEffect, useRef, useState } from "react";
import { OPTICAL_GRID, type OpticalPattern } from "@/lib/pixel/optical";
import { encodePayFaceMatrix } from "@/lib/pixel/pay-face-optical";

/**
 * PXP1-P paint — full-on / full-off only (RGB565-safe).
 * Glow is CSS in the quiet zone / behind the grid, never inside cells.
 */
function projectorCssGrid(pattern: OpticalPattern): string[] {
  return pattern.cells.map((v) => ((v ?? 0) > 127 ? "#ffffff" : "#000000"));
}

function paintPayFace(canvas: HTMLCanvasElement, cells: number[], cssSize: number): void {
  const grid = OPTICAL_GRID;
  const dpr =
    typeof window !== "undefined" ? Math.max(1, Math.floor(window.devicePixelRatio || 1)) : 1;
  // Fill the stage edge-to-edge; split remainder pixels across cells (no side gutter).
  const px = Math.max(grid, Math.floor(cssSize * dpr));
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < grid; row++) {
    const y0 = Math.floor((row * px) / grid);
    const y1 = Math.floor(((row + 1) * px) / grid);
    for (let col = 0; col < grid; col++) {
      const x0 = Math.floor((col * px) / grid);
      const x1 = Math.floor(((col + 1) * px) / grid);
      const on = (cells[row * grid + col] ?? 0) > 127;
      ctx.fillStyle = on ? "#ffffff" : "#000000";
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
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
  const [cells, setCells] = useState<number[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const projector = props.projector !== false;

  const onReady = props.onReady;
  useEffect(() => {
    let cancelled = false;
    setColors(null);
    setCells(null);
    setErr(null);
    void encodePayFaceMatrix(props.address)
      .then((pattern) => {
        if (cancelled) return;
        setColors(projectorCssGrid(pattern));
        setCells(pattern.cells);
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

  useEffect(() => {
    if (!projector || !cells) return;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const draw = () => {
      const size = Math.min(stage.clientWidth, stage.clientHeight);
      if (size < 16) return;
      paintPayFace(canvas, cells, size);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(stage);
    window.addEventListener("resize", draw);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [projector, cells]);

  if (err) {
    return <p className="text-xs text-amber-200/90">{err}</p>;
  }
  if (!colors || !cells) {
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
          {/* Quiet zone outside the grid — registration marks only here, never in cells. */}
          <div className="kindling-projector-quiet" ref={stageRef}>
            <canvas
              ref={canvasRef}
              className="kindling-projector-canvas"
              role="img"
              aria-label={`Kindling pay face for ${props.address}`}
            />
          </div>
        </div>
      </div>
      <div className="kindling-projector-footer">
        <p className="kindling-projector-hint">
          Fill their camera with this square · PXP1-P · vault sealed
        </p>
        <button
          type="button"
          className="kindling-projector-close"
          onClick={() => props.onClose?.()}
        >
          Hide face
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  cameraCaptureAvailable,
  openOpticalCamera,
  patternToCssGrid,
  type CameraSession,
  type OpticalPattern,
} from "@/lib/pixel";

export function OpticalPanel({
  pattern,
  ok,
  busy,
  onProject,
  onCapture,
  onCameraCapture,
}: {
  pattern: OpticalPattern | null;
  ok: boolean | null;
  busy: boolean;
  onProject: () => void;
  /** Headless / lab fallback */
  onCapture: () => void;
  /** Real getUserMedia sample → parent verifies */
  onCameraCapture?: (cells: number[]) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [session, setSession] = useState<CameraSession | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const canCam = typeof window !== "undefined" && cameraCaptureAvailable();

  useEffect(() => {
    return () => {
      session?.stop();
    };
  }, [session]);

  const startCamera = async () => {
    setCamError(null);
    try {
      const s = await openOpticalCamera();
      if (videoRef.current) {
        videoRef.current.srcObject = s.stream;
        await videoRef.current.play();
      }
      setSession(s);
    } catch (e) {
      setCamError(e instanceof Error ? e.message : "Camera denied");
    }
  };

  const stopCamera = () => {
    session?.stop();
    setSession(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const snap = async () => {
    if (!session || !onCameraCapture) return;
    const { captureFromVideo } = await import("@/lib/pixel");
    const result = captureFromVideo(session.video);
    await onCameraCapture(result.cells);
  };

  return (
    <section id="optical" className="pixel-rise relative">
      <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
        Analog bridge
      </p>
      <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        The picture holds the key
      </h2>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
        Your screen shines a luminance maze. Those light levels are the secret. Another device opens
        its camera (getUserMedia), samples the grid, and recovers the key — not an in-memory copy.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onProject}
          className="font-pixel rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-45"
        >
          Project key light
        </button>
        {canCam && onCameraCapture && (
          <>
            {!session ? (
              <button
                type="button"
                disabled={busy || !pattern}
                onClick={() => void startCamera()}
                className="font-pixel rounded-md border border-border bg-background/60 px-5 py-2.5 text-sm font-semibold backdrop-blur transition hover:bg-accent disabled:opacity-45"
              >
                Open camera
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void snap()}
                  className="font-pixel rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-45"
                >
                  Sample frame
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="font-pixel rounded-md border border-border px-5 py-2.5 text-sm font-semibold"
                >
                  Close camera
                </button>
              </>
            )}
          </>
        )}
        <button
          type="button"
          disabled={busy || !pattern}
          onClick={onCapture}
          className="font-pixel rounded-md border border-dashed border-border/80 px-5 py-2.5 text-xs font-semibold text-muted-foreground disabled:opacity-45"
          title="In-process simulation for environments without a camera"
        >
          Simulate read (CI)
        </button>
        {ok !== null && (
          <span className="font-pixel self-center text-sm font-semibold text-primary">
            {ok ? "Key recovered" : "Capture failed"}
          </span>
        )}
      </div>
      {camError && <p className="mt-2 text-sm text-destructive">{camError}</p>}

      <div className="mt-10 flex flex-wrap items-start gap-8">
        {pattern && (
          <div className="pixel-reveal inline-block" data-optical-projector="1">
            <div
              className="grid gap-[3px] p-3"
              style={{
                gridTemplateColumns: `repeat(${pattern.width}, 1fr)`,
                background: "linear-gradient(145deg, oklch(0.2 0.03 145), oklch(0.28 0.04 155))",
                boxShadow: "0 0 60px oklch(0.9 0.08 85 / 0.45)",
              }}
            >
              {patternToCssGrid(pattern).map((color, i) => (
                <div key={i} className="size-3 sm:size-4" style={{ backgroundColor: color }} />
              ))}
            </div>
            <p className="mt-3 max-w-xs text-xs text-muted-foreground">
              Seal {pattern.checksum.slice(0, 20)}… — point a second device camera here.
            </p>
          </div>
        )}

        <div className="min-w-[240px] flex-1">
          <video
            ref={videoRef}
            className="aspect-video w-full max-w-md rounded-md bg-black/80 object-cover"
            playsInline
            muted
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {session
              ? "Camera live — aim at the projector grid, then Sample frame."
              : "Camera preview appears here after Open camera."}
          </p>
        </div>
      </div>
    </section>
  );
}

import { patternToCssGrid, type OpticalPattern } from "@/lib/pixel";

export function OpticalPanel({
  pattern,
  ok,
  busy,
  onProject,
  onCapture,
}: {
  pattern: OpticalPattern | null;
  ok: boolean | null;
  busy: boolean;
  onProject: () => void;
  onCapture: () => void;
}) {
  return (
    <section id="optical" className="pixel-rise relative">
      <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
        Analog bridge
      </p>
      <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        The picture holds the key
      </h2>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
        Your screen shines a luminance maze. Those light levels are the secret — not a metaphor. A
        camera, or another open screen held against it, reads the key back. Flashlight helps when
        daylight washes the phosphor.
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
        <button
          type="button"
          disabled={busy || !pattern}
          onClick={onCapture}
          className="font-pixel rounded-md border border-border bg-background/60 px-5 py-2.5 text-sm font-semibold backdrop-blur transition hover:bg-accent disabled:opacity-45"
        >
          Read with camera
        </button>
        {ok !== null && (
          <span className="font-pixel self-center text-sm font-semibold text-primary">
            {ok ? "Key recovered" : "Capture failed"}
          </span>
        )}
      </div>

      {pattern && (
        <div className="pixel-reveal mt-10 inline-block">
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
            Seal {pattern.checksum.slice(0, 20)}… — hold another screen here to exchange without
            typing secrets.
          </p>
        </div>
      )}
    </section>
  );
}

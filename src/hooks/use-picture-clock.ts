import { useEffect, useState } from "react";

/**
 * A clock for the picture, so it can move between tips.
 *
 * The picture had no notion of now: brightness came from cumulative moments, which never
 * dim, so nothing changed until a block arrived. Fireflies need a clock.
 *
 * Driven by `requestAnimationFrame` but throttled, because the picture is a field of
 * thousands of cells and there is nothing to gain from re-rendering all of them at display
 * rate. Twelve updates a second is plenty for a twinkle and cheap enough to leave running.
 *
 * Honours `prefers-reduced-motion`: when set, the clock does not tick at all, so the picture
 * stays still and brightness falls back to whatever the last frame computed. Motion here is
 * decoration, and decoration must not be forced on somebody who asked for none.
 */
export function usePictureClock(fps = 12): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let raf = 0;
    let last = 0;
    const interval = 1000 / Math.max(1, fps);

    const tick = (t: number) => {
      if (t - last >= interval) {
        last = t;
        setNow(Date.now());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps]);

  return now;
}

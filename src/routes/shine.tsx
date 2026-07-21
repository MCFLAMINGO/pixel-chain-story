import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useContinuityOps } from "@/hooks/use-continuity-ops";
import {
  fetchMcFlamingoHomepageHtml,
  MCFLAMINGO_MENU_URL,
  MCFLAMINGO_ORDER_URL,
  MCFLAMINGO_ORIGIN_URL,
  mcflamingoContinuityHonesty,
  merchantOfferCopy,
  seedMcFlamingoDemo,
  selfServeShineIn,
  shineInPlainThesis,
  tillAccruedPix,
} from "@/lib/pixel/continuity-ops";

export const Route = createFileRoute("/shine")({
  head: () => ({
    meta: [
      { title: "Shine in — PIXEL Continuity" },
      {
        name: "description",
        content:
          "Keep your website reachable when the host blinks. Bring your brand. Press Shine in.",
      },
    ],
  }),
  component: ShineInPage,
});

function ShineInPage() {
  const { state, setState, ready } = useContinuityOps();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [doneId, setDoneId] = useState<string | null>(null);

  const doneStore = doneId ? state.stores.find((s) => s.id === doneId) : null;

  async function onShine(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const domain = website
        .trim()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
      const origin =
        typeof window !== "undefined"
          ? website.trim().startsWith("http")
            ? website.trim()
            : `https://${domain}`
          : `https://${domain}`;
      const next = await selfServeShineIn(state, {
        name,
        domain,
        originUrl: origin,
        mirrorUrls: [origin, origin],
      });
      setState(next);
      setDoneId(next.stores[0]?.id ?? null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not shine in");
    } finally {
      setBusy(false);
    }
  }

  async function onMcFlamingo() {
    setErr("");
    setBusy(true);
    try {
      const { html, originUrl } = await fetchMcFlamingoHomepageHtml();
      const next = await seedMcFlamingoDemo(state, html, {
        originUrl,
        // Live restaurant URLs only — never localhost snapshot as a “menu” link.
        mirrorUrls: [MCFLAMINGO_ORIGIN_URL, MCFLAMINGO_MENU_URL],
      });
      setState(next);
      setDoneId(next.stores[0]?.id ?? null);
      setName("McFlamingo");
      setWebsite("www.mcflamingo.com");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Demo failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <main className="continuity-desk flex min-h-screen items-center justify-center text-muted-foreground">
        Opening…
      </main>
    );
  }

  return (
    <main className="continuity-desk shine-in-page min-h-screen text-foreground">
      <div className="continuity-glow" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <p
          className="font-pixel shine-fade text-xs tracking-[0.32em] text-primary uppercase"
          style={{ animationDelay: "0ms" }}
        >
          Pixel · Continuity
        </p>
        <h1
          className="font-pixel shine-fade mt-5 text-5xl font-bold tracking-tight md:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          Keep the lights on
        </h1>
        <p
          className="shine-fade mt-5 max-w-md text-lg leading-relaxed text-muted-foreground"
          style={{ animationDelay: "160ms" }}
        >
          {shineInPlainThesis()}
        </p>

        {doneStore ? (
          <div className="shine-rise mt-12" role="status">
            <p className="font-pixel text-2xl text-primary">You’re in the light.</p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">{doneStore.name}</span> Continuity digest is{" "}
              {doneStore.anchoredOnPixel ? (
                <>
                  anchored on Pixel at tip #{doneStore.pixelIndex} (
                  <span className="font-mono text-xs">{doneStore.registerRef}</span>).
                </>
              ) : (
                <>not yet on Pixel — something went wrong.</>
              )}{" "}
              {merchantOfferCopy(doneStore)}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">{mcflamingoContinuityHonesty()}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              State: {doneStore.continuity?.state ?? "—"}
              {doneStore.digest ? ` · digest ${doneStore.digest.slice(0, 12)}…` : ""}
              {doneStore.tipHash ? ` · tip ${doneStore.tipHash.slice(0, 12)}…` : ""}
              {tillAccruedPix(doneStore) > 0
                ? ` · till accrued ${tillAccruedPix(doneStore)} PIX`
                : ""}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={MCFLAMINGO_MENU_URL}
                className="continuity-btn"
                target="_blank"
                rel="noreferrer"
              >
                Open live McFlamingo menu
              </a>
              <a
                href={MCFLAMINGO_ORDER_URL}
                className="continuity-btn-ghost"
                target="_blank"
                rel="noreferrer"
              >
                Order on Popmenu
              </a>
              <Link to="/continuity" className="continuity-btn-ghost">
                Continuity desk (lab)
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Homepage:{" "}
              <a
                className="underline"
                href={MCFLAMINGO_ORIGIN_URL}
                target="_blank"
                rel="noreferrer"
              >
                www.mcflamingo.com
              </a>
            </p>
            <button
              type="button"
              className="continuity-btn-ghost mt-4"
              onClick={() => setDoneId(null)}
            >
              Shine in another brand
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => void onShine(e)}
            className="shine-fade mt-12 space-y-5"
            style={{ animationDelay: "240ms" }}
          >
            <label className="block">
              <span className="font-pixel text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Your brand
              </span>
              <input
                className="continuity-input mt-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="McFlamingo"
                autoComplete="organization"
                required
              />
            </label>
            <label className="block">
              <span className="font-pixel text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Your website
              </span>
              <input
                className="continuity-input mt-1.5"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="www.mcflamingo.com"
                autoComplete="url"
                required
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Finish your site however you already do. Then press Shine in — we hold the map so
              Continuity can outlive a dead host. McFlamingo preview opens{" "}
              <a
                className="underline"
                href={MCFLAMINGO_ORIGIN_URL}
                target="_blank"
                rel="noreferrer"
              >
                www.mcflamingo.com
              </a>
              , not a local menu page.
            </p>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <button type="submit" className="continuity-btn w-full text-base" disabled={busy}>
              {busy ? "Shining…" : "Shine in"}
            </button>
            <button
              type="button"
              className="continuity-btn-ghost w-full"
              disabled={busy}
              onClick={() => void onMcFlamingo()}
            >
              Try with real McFlamingo — then open the live menu
            </button>
          </form>
        )}

        <p className="mt-16 text-xs leading-relaxed text-muted-foreground">
          No DNS panels. No rsync. Lab note: this browser keeps your Continuity record locally for
          now — same idea as Spotify: you press play; the mirrors stay backstage.
        </p>
      </div>
    </main>
  );
}

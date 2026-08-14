import { createFileRoute } from "@tanstack/react-router";
import { buildCapabilities, buildMarker } from "@/lib/pixel";

/**
 * What the deployed bundle can actually do — so "is the deploy current?" is one request.
 *
 * That question has come up repeatedly and been answered by guessing every time: greping
 * minified bundles for strings minification had already mangled, reading class names out of
 * HTML. The deployed asset filenames carry content hashes, so it is possible to tell *that*
 * a build changed and impossible to tell *what is in it*.
 *
 * Its own route rather than a `<meta>` tag on the billboard, so the diagnostic costs the
 * page nothing: these modules are only imported when somebody asks.
 *
 * Computed in the loader, not in an effect, so it renders server-side and a single
 * `curl .../build | grep has=` answers the question. A client-only version rendered
 * "checking…" to curl, which is the same as not answering.
 *
 * Every flag is computed by importing the real symbol, never asserted as a constant, so it
 * cannot claim a capability the bundle does not have. A hand-maintained version string
 * drifts, and a drifted one is worse than none because it gets believed.
 */
export const Route = createFileRoute("/build")({
  loader: async () => ({ caps: await buildCapabilities() }),
  component: BuildPage,
});

function BuildPage() {
  const { caps } = Route.useLoaderData();

  return (
    <main className="min-h-screen bg-[oklch(0.08_0.02_145)] p-6 text-white">
      <h1 className="font-pixel text-2xl font-bold tracking-tight">PIXEL — build</h1>
      <p className="mt-2 max-w-xl text-sm text-[oklch(0.85_0.02_95)]">
        What this bundle can do, computed by importing each capability rather than by asserting it.
        If something reads <code>no</code>, the deploy predates it.
      </p>

      <pre
        className="font-pixel mt-6 overflow-x-auto rounded-md bg-black/60 p-4 text-xs ring-1 ring-white/10"
        data-testid="build-marker"
      >
        {buildMarker(caps)}
      </pre>
      <dl className="font-pixel mt-6 grid max-w-lg grid-cols-[1fr_auto] gap-y-2 text-sm">
        {(
          [
            ["wallet export / import", caps.walletExport],
            ["incremental pixel fetch", caps.incrementalPixels],
            ["chain mirror in wallets", caps.chainMirror],
            ["fireflies (wave-driven)", caps.fireflies],
            ["gift & record rules", caps.giftAndRecord],
          ] as Array<[string, boolean]>
        ).map(([label, on]) => (
          <div key={label} className="col-span-2 flex justify-between gap-6">
            <dt className="text-[oklch(0.88_0.02_95)]">{label}</dt>
            <dd className={on ? "text-[oklch(0.9_0.18_145)]" : "text-[oklch(0.75_0.18_25)]"}>
              {on ? "yes" : "no"}
            </dd>
          </div>
        ))}
        <div className="col-span-2 mt-2 flex justify-between gap-6">
          <dt className="text-[oklch(0.88_0.02_95)]">default tip</dt>
          <dd className="truncate text-[oklch(0.85_0.02_95)]">{caps.defaultTip}</dd>
        </div>
      </dl>
    </main>
  );
}

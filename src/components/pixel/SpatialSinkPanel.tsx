import { Link } from "@tanstack/react-router";
import { SpatialSinkView } from "@/components/pixel/SpatialSinkView";
import { useSpatialSink } from "@/hooks/use-spatial-sink";
import { spatialSinkThesis, type PixelChainState } from "@/lib/pixel";

/** Lab /spatial panel — Three.js tip picture. UI sink only. */
export function SpatialSinkPanel({
  chain,
  rpcBase,
}: {
  chain?: PixelChainState | null;
  rpcBase?: string;
}) {
  const {
    scene,
    source,
    error,
    rpcBase: resolvedRpc,
  } = useSpatialSink({
    chain,
    rpcBase,
  });
  const thesis = spatialSinkThesis();

  return (
    <section id="spatial-sink" className="pixel-rise">
      <p className="font-pixel text-xs font-semibold tracking-[0.28em] text-primary uppercase">
        Spatial sink · S5
      </p>
      <h2 className="font-pixel mt-3 text-3xl font-bold tracking-tight md:text-4xl">
        Illuminated picture — view only
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">{thesis}</p>
      <p className="font-pixel mt-2 text-xs tracking-widest text-muted-foreground uppercase">
        UI sink — not consensus · source {source}
        {resolvedRpc ? ` · rpc ${resolvedRpc}` : " · local tip"}
      </p>

      <div className="mt-8">
        {error && (
          <p className="mb-3 text-sm text-destructive">
            Sink fetch: {error}. Tip digests still live on the node.
          </p>
        )}
        {scene && scene.cells.length > 0 ? (
          <>
            <SpatialSinkView scene={scene} />
            <dl className="mt-4 grid gap-2 font-pixel text-xs tracking-wide text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="uppercase">spatialRoot</dt>
                <dd className="mt-1 break-all text-foreground/80">
                  {scene.spatialRoot.slice(0, 32)}…
                </dd>
              </div>
              <div>
                <dt className="uppercase">waveDigest</dt>
                <dd className="mt-1 break-all text-foreground/80">
                  {scene.waveDigest ? `${scene.waveDigest.slice(0, 32)}…` : "—"}
                </dd>
              </div>
              <div>
                <dt className="uppercase">cells / wave hits</dt>
                <dd className="mt-1 text-foreground/80">
                  {scene.cells.length} lit · {scene.waveHits.length} hits
                  {scene.tipIndex !== undefined ? ` · tip #${scene.tipIndex}` : ""}
                </dd>
              </div>
              <div>
                <dt className="uppercase">doctrine</dt>
                <dd className="mt-1 text-foreground/80">display only — acceptBlock recomputes</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No illuminated cells yet. Sequence a tip on the{" "}
            <Link to="/" className="text-primary underline-offset-4 hover:underline">
              live field
            </Link>{" "}
            or set <code className="text-foreground">VITE_PIXEL_RPC</code>.
          </p>
        )}
      </div>
    </section>
  );
}

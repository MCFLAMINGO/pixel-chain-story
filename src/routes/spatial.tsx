import { createFileRoute, Link } from "@tanstack/react-router";
import { SpatialSinkPanel } from "@/components/pixel/SpatialSinkPanel";
import { usePixelChain } from "@/hooks/use-pixel-chain";
import { spatialSinkThesis } from "@/lib/pixel";
import { defaultPixelRpc } from "@/lib/pixel-rpc";

/** Deep link for the Three.js spatial sink — UI only, not consensus. */
export const Route = createFileRoute("/spatial")({
  head: () => ({
    meta: [
      { title: "PIXEL — spatial sink" },
      {
        name: "description",
        content: "Three.js view of tip illuminated cells — UI sink, not consensus truth.",
      },
    ],
  }),
  component: SpatialPage,
});

function SpatialPage() {
  const pixel = usePixelChain();
  const rpc = defaultPixelRpc();

  return (
    <main className="min-h-screen overflow-x-hidden text-foreground">
      <div className="mx-auto max-w-5xl px-6 pt-10">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to="/"
            className="font-pixel text-xs tracking-[0.28em] text-primary uppercase underline-offset-4 hover:underline"
          >
            ← Live field
          </Link>
          <Link
            to="/lab"
            className="font-pixel text-xs tracking-[0.28em] text-primary uppercase underline-offset-4 hover:underline"
          >
            Lab
          </Link>
          <Link
            to="/doors"
            className="font-pixel text-xs tracking-[0.28em] text-primary uppercase underline-offset-4 hover:underline"
          >
            Doors
          </Link>
        </div>
        <h1 className="font-pixel mt-6 text-4xl font-bold tracking-tight md:text-5xl">Spatial</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">{spatialSinkThesis()}</p>
      </div>
      <div className="mx-auto max-w-5xl space-y-16 px-6 py-16">
        <SpatialSinkPanel chain={pixel.chain} rpcBase={rpc} />
      </div>
    </main>
  );
}

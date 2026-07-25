import { createFileRoute, Link } from "@tanstack/react-router";
import { BillboardScreen } from "@/components/pixel/BillboardScreen";
import { defaultPixelRpc, missingPublicTipInProduction } from "@/lib/pixel-rpc";

/**
 * The site *is* the billboard — record from genesis; later aim Times Square here.
 *
 *   /                      → cinema field (optional ?rpc=)
 *   /?rpc=http://host:8545 → live canonical node
 *   VITE_PIXEL_RPC         → default feed when deployed
 *   VITE_REQUIRE_PUBLIC_TIP=1 → production builds refuse lab light as “public”
 */
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PIXEL — live field" },
      {
        name: "description",
        content:
          "Watch the Pixel Ledger illuminate from genesis. The public picture of settlement — void until light.",
      },
      { property: "og:title", content: "PIXEL — live field" },
      {
        property: "og:description",
        content: "Genesis fills the frame. As light arrives, the camera pulls back.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    rpc: typeof s.rpc === "string" ? s.rpc : undefined,
  }),
  component: HomeField,
});

function HomeField() {
  const { rpc: rpcQuery } = Route.useSearch();
  const rpc = rpcQuery ?? defaultPixelRpc();
  if (missingPublicTipInProduction(rpc)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[oklch(0.08_0.02_145)] px-6 text-foreground">
        <div className="max-w-lg text-center">
          <p className="font-pixel text-xs tracking-[0.35em] text-[oklch(0.9_0.14_95)] uppercase">
            Public tip required
          </p>
          <h1 className="font-pixel mt-4 text-4xl font-bold text-white">PIXEL</h1>
          <p className="mt-4 text-[oklch(0.88_0.02_95)]">
            This production build refuses lab light as the public picture. Host a durable tip and
            set <code className="text-white">VITE_PIXEL_RPC</code>. Recipe:{" "}
            <span className="text-white">docs/CANONICAL-TIP.md</span>.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/lab"
              className="font-pixel text-xs tracking-[0.28em] text-[oklch(0.92_0.14_95)] uppercase underline-offset-4 hover:underline"
            >
              Lab look-dev →
            </Link>
            <Link
              to="/doors"
              className="font-pixel text-xs tracking-[0.28em] text-[oklch(0.92_0.14_95)] uppercase underline-offset-4 hover:underline"
            >
              Doors
            </Link>
          </div>
        </div>
      </main>
    );
  }
  return <BillboardScreen rpc={rpc} showLabLink />;
}

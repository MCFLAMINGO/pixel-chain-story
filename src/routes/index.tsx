import { createFileRoute } from "@tanstack/react-router";
import { BillboardScreen } from "@/components/pixel/BillboardScreen";
import { defaultPixelRpc } from "@/lib/pixel-rpc";

/**
 * The site *is* the billboard — record from genesis; later aim Times Square here.
 *
 *   /                      → cinema field (optional ?rpc=)
 *   /?rpc=http://host:8545 → live canonical node
 *   VITE_PIXEL_RPC         → default feed when deployed
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
  return <BillboardScreen rpc={rpc} showLabLink />;
}

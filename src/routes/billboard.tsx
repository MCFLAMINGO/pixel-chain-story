import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy path — the site face is `/`. Keep /billboard as an alias for screenshots & ops.
 */
export const Route = createFileRoute("/billboard")({
  validateSearch: (s: Record<string, unknown>) => ({
    rpc: typeof s.rpc === "string" ? s.rpc : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/",
      search: search.rpc ? { rpc: search.rpc } : {},
    });
  },
});

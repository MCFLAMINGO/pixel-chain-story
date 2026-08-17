import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy path — the site face is `/`. Keep /billboard as an alias for screenshots & ops.
 */
export const Route = createFileRoute("/billboard")({
  /**
   * `rpc` is an OPTIONAL KEY, not a required key holding `string | undefined`.
   *
   * Returning `{ rpc: undefined }` made the key required in the route's search type, so
   * every `<Link to="/">` in the app had to pass `search` explicitly and every omission
   * was a type error. Returning `{}` when the parameter is absent says what is actually
   * true — the field has no rpc override — and lets `search={x ? { rpc: x } : {}}` type
   * check, which is the shape the call sites already used.
   */
  validateSearch: (s: Record<string, unknown>): { rpc?: string } =>
    typeof s.rpc === "string" ? { rpc: s.rpc } : {},
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/",
      search: search.rpc ? { rpc: search.rpc } : {},
    });
  },
});

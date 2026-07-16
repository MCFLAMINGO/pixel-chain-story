/** Default RPC for the public live field — set at build time for a canonical mosaic. */
export function defaultPixelRpc(): string | undefined {
  const fromEnv =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_PIXEL_RPC as string | undefined)
      : undefined;
  return fromEnv?.trim() || undefined;
}

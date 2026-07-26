import { PUBLIC_TIP_RPC_DEFAULT } from "./pixel/crowned-genesis";

/**
 * Default RPC for the public live field + /wallet.
 * Env wins; otherwise the crowned public tip (friends can open /wallet with no build vars).
 * Local tip: VITE_PIXEL_RPC=http://127.0.0.1:8545
 */
export function defaultPixelRpc(): string | undefined {
  const fromEnv =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_PIXEL_RPC as string | undefined)
      : undefined;
  const trimmed = fromEnv?.trim();
  if (trimmed) return trimmed;
  return PUBLIC_TIP_RPC_DEFAULT;
}

/**
 * Production builds may require a public tip (VITE_REQUIRE_PUBLIC_TIP=1).
 * Lab/dev omit this — browser genesis stays honest “lab light”.
 */
export function requirePublicTip(): boolean {
  const flag =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_REQUIRE_PUBLIC_TIP as string | undefined)
      : undefined;
  return flag === "1" || flag === "true";
}

/** True when the site is a production build without a tip feed configured. */
export function missingPublicTipInProduction(rpc?: string): boolean {
  const prod = typeof import.meta !== "undefined" ? Boolean(import.meta.env?.PROD) : false;
  return prod && requirePublicTip() && !rpc?.trim();
}

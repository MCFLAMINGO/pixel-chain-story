import {
  CROWNED_GENESIS_HASH,
  CROWNED_NETWORK_ID,
  PUBLIC_TIP_RPC_DEFAULT,
} from "./pixel/crowned-genesis";
import { builtinTipMirrors } from "./pixel/tip-mirrors";

/**
 * Default RPC for the public live field + /wallet.
 * Env wins; otherwise the crowned public tip (friends can open /wallet with no build vars).
 * Local tip: VITE_PIXEL_RPC=http://127.0.0.1:8545
 *
 * Prefer {@link tipRpcCandidates} when probing — one dead host must not brick the site.
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
 * Ordered tip HTTP bases to try for people surfaces.
 * Env (or explicit override) first, then builtin `tip-mirrors.json` entries, deduped.
 */
export function tipRpcCandidates(override?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u?: string) => {
    const t = u?.trim().replace(/\/$/, "");
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  push(override);
  push(defaultPixelRpc());
  try {
    const mirrors = builtinTipMirrors();
    if (mirrors.networkId === CROWNED_NETWORK_ID && mirrors.genesisHash === CROWNED_GENESIS_HASH) {
      for (const m of mirrors.mirrors) push(m.rpc);
    }
  } catch {
    /* builtin always works */
  }
  return out;
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

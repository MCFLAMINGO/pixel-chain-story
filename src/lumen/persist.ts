/**
 * Persist Lumen modules beside chain state.
 *
 * Browser: localStorage `pixel.lumen.modules.v1`
 * Node: `lumen-modules.json` in the datadir (see `src/node/lumen-store.ts`)
 *
 * Source text is canonical — re-parse on load. Never put seeds in this blob.
 */

import { parseLumen } from "./parse";
import { checkLumen, type CheckResult } from "./check";

export const LUMEN_MODULES_STORAGE_KEY = "pixel.lumen.modules.v1";

export type PersistedLumenModule = {
  name: string;
  source: string;
  updatedAt: number;
};

export type PersistedLumenBundle = {
  v: 1;
  updatedAt: number;
  activeName: string;
  modules: PersistedLumenModule[];
};

export function emptyLumenBundle(seed?: { name: string; source: string }): PersistedLumenBundle {
  const now = Date.now();
  if (!seed) {
    return { v: 1, updatedAt: now, activeName: "", modules: [] };
  }
  const mod = parseLumen(seed.source);
  return {
    v: 1,
    updatedAt: now,
    activeName: mod.name,
    modules: [{ name: mod.name, source: seed.source, updatedAt: now }],
  };
}

export function upsertLumenModule(
  bundle: PersistedLumenBundle,
  source: string,
  opts?: { activate?: boolean },
): PersistedLumenBundle {
  const mod = parseLumen(source);
  const now = Date.now();
  const entry: PersistedLumenModule = { name: mod.name, source, updatedAt: now };
  const rest = bundle.modules.filter((m) => m.name !== mod.name);
  return {
    v: 1,
    updatedAt: now,
    activeName: opts?.activate === false ? bundle.activeName || mod.name : mod.name,
    modules: [...rest, entry],
  };
}

export function activeLumenSource(bundle: PersistedLumenBundle): string | null {
  const hit = bundle.modules.find((m) => m.name === bundle.activeName) ?? bundle.modules[0] ?? null;
  return hit?.source ?? null;
}

export function validateLumenSource(source: string): {
  name: string;
  check: CheckResult;
} {
  const mod = parseLumen(source);
  return { name: mod.name, check: checkLumen(mod) };
}

export function parseLumenBundle(raw: unknown): PersistedLumenBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as PersistedLumenBundle;
  if (b.v !== 1 || !Array.isArray(b.modules)) return null;
  const modules = b.modules.filter(
    (m) => m && typeof m.name === "string" && typeof m.source === "string",
  );
  return {
    v: 1,
    updatedAt: typeof b.updatedAt === "number" ? b.updatedAt : Date.now(),
    activeName: typeof b.activeName === "string" ? b.activeName : (modules[0]?.name ?? ""),
    modules,
  };
}

/** Browser load — null when no storage or empty. */
export function loadLumenBundleLocal(): PersistedLumenBundle | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LUMEN_MODULES_STORAGE_KEY);
    if (!raw) return null;
    return parseLumenBundle(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveLumenBundleLocal(bundle: PersistedLumenBundle): void {
  if (typeof localStorage === "undefined") {
    throw new Error("Lumen persist needs a browser (localStorage)");
  }
  localStorage.setItem(LUMEN_MODULES_STORAGE_KEY, JSON.stringify(bundle));
}

export function clearLumenBundleLocal(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LUMEN_MODULES_STORAGE_KEY);
}

export function lumenPersistThesis(): string {
  return (
    "Lumen modules persist beside chain state: browser localStorage and node " +
    "datadir lumen-modules.json next to chain.json. Source is canonical; types " +
    "are checked on parse/run — never decorative."
  );
}

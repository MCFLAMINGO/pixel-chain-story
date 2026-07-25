import { useCallback, useEffect, useState } from "react";
import {
  TRANSFER_LUMEN,
  activeLumenSource,
  clearLumenBundleLocal,
  emptyLumenBundle,
  loadLumenBundleLocal,
  saveLumenBundleLocal,
  upsertLumenModule,
  validateLumenSource,
  type PersistedLumenBundle,
} from "@/lumen";

/**
 * Browser Lumen modules beside lab session — localStorage mirror of node
 * `lumen-modules.json` (persist thesis: modules live next to chain state).
 */
export function useLumenModules() {
  const [bundle, setBundle] = useState<PersistedLumenBundle>(() => {
    const loaded = loadLumenBundleLocal();
    if (loaded && loaded.modules.length > 0) return loaded;
    return emptyLumenBundle({ name: "Transfer", source: TRANSFER_LUMEN });
  });
  const [source, setSourceState] = useState(() => activeLumenSource(bundle) ?? TRANSFER_LUMEN);
  const [typeErrors, setTypeErrors] = useState<string[]>([]);

  useEffect(() => {
    try {
      saveLumenBundleLocal(bundle);
    } catch {
      /* non-browser */
    }
  }, [bundle]);

  const setSource = useCallback((next: string) => {
    setSourceState(next);
    try {
      const { check } = validateLumenSource(next);
      setTypeErrors(check.diagnostics.filter((d) => d.level === "error").map((d) => d.message));
      if (check.ok) {
        setBundle((b) => upsertLumenModule(b, next));
      }
    } catch (e) {
      setTypeErrors([e instanceof Error ? e.message : "parse failed"]);
    }
  }, []);

  const persistNow = useCallback(() => {
    try {
      const { check } = validateLumenSource(source);
      setTypeErrors(check.diagnostics.filter((d) => d.level === "error").map((d) => d.message));
      if (!check.ok) return false;
      const next = upsertLumenModule(bundle, source);
      setBundle(next);
      saveLumenBundleLocal(next);
      return true;
    } catch (e) {
      setTypeErrors([e instanceof Error ? e.message : "persist failed"]);
      return false;
    }
  }, [bundle, source]);

  const reset = useCallback(() => {
    clearLumenBundleLocal();
    const seeded = emptyLumenBundle({ name: "Transfer", source: TRANSFER_LUMEN });
    setBundle(seeded);
    setSourceState(TRANSFER_LUMEN);
    setTypeErrors([]);
  }, []);

  return {
    bundle,
    source,
    setSource,
    typeErrors,
    moduleNames: bundle.modules.map((m) => m.name),
    persistNow,
    reset,
  };
}

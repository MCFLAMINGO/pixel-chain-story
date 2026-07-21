import { useEffect, useState } from "react";
import {
  CONTINUITY_CHAIN_KEY,
  exportContinuitySession,
  importContinuitySession,
  loadContinuitySessionBlob,
  saveContinuitySessionBlob,
  type ContinuitySession,
} from "@/lib/pixel/continuity-settlement";

export function useContinuityChain() {
  const [session, setSessionState] = useState<ContinuitySession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const blob = loadContinuitySessionBlob();
        if (blob) {
          setSessionState(await importContinuitySession(blob));
        }
      } catch {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(CONTINUITY_CHAIN_KEY);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function setSession(next: ContinuitySession | null) {
    setSessionState(next);
    if (!next) {
      if (typeof localStorage !== "undefined") localStorage.removeItem(CONTINUITY_CHAIN_KEY);
      return;
    }
    saveContinuitySessionBlob(await exportContinuitySession(next));
  }

  return { session, setSession, ready };
}

import { useEffect, useState } from "react";
import {
  CONTINUITY_OPS_KEY,
  emptyOpsState,
  type ContinuityOpsState,
} from "@/lib/pixel/continuity-ops";

function load(): ContinuityOpsState {
  if (typeof localStorage === "undefined") return emptyOpsState();
  try {
    const raw = localStorage.getItem(CONTINUITY_OPS_KEY);
    if (!raw) return emptyOpsState();
    const parsed = JSON.parse(raw) as ContinuityOpsState;
    if (!parsed?.rungs?.length || !Array.isArray(parsed.stores)) return emptyOpsState();
    return parsed;
  } catch {
    return emptyOpsState();
  }
}

export function useContinuityOps() {
  const [state, setState] = useState<ContinuityOpsState>(() => emptyOpsState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(CONTINUITY_OPS_KEY, JSON.stringify(state));
  }, [state, ready]);

  return { state, setState, ready };
}

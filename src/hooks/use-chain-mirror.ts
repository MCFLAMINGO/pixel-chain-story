/**
 * Keep a copy of the picture on this device, quietly.
 *
 * One Railway volume holds the only copy of this history. Asking people to run a
 * server fixes that and almost nobody will; handing them a wallet already happens.
 * So the copy rides along with the wallet — no commands, no volunteers, nobody
 * asked to care.
 *
 * Failures are reported rather than swallowed. A device that could not keep a copy
 * must not look like one that did.
 *
 * Tip hosts are cattle: {@link tipRpcCandidates} tries env / mirrors in order so a
 * single dead Railway URL does not strand the phone copy.
 */

import { useCallback, useEffect, useState } from "react";
import {
  exportMirrorHtml,
  mirrorState,
  syncMirror,
  type MirrorState,
} from "@/lib/pixel/chain-mirror";
import { clearMirror, idbMirrorStore } from "@/lib/pixel/chain-mirror-idb";
import { tipRpcCandidates } from "@/lib/pixel-rpc";

export type MirrorStatus = "idle" | "syncing" | "held" | "unavailable" | "diverged";

export function useChainMirror(rpc?: string, expectGenesis?: string) {
  const [state, setState] = useState<MirrorState | null>(null);
  const [status, setStatus] = useState<MirrorStatus>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [activeRpc, setActiveRpc] = useState<string | null>(null);

  const sync = useCallback(async () => {
    const candidates = tipRpcCandidates(rpc);
    if (candidates.length === 0) return;
    setStatus("syncing");
    let lastDetail: string | null = null;
    for (const base of candidates) {
      try {
        const res = await syncMirror({ rpcBase: base, store: idbMirrorStore(), expectGenesis });
        if (res.ok) {
          setState(res.state);
          setStatus("held");
          setNote(null);
          setActiveRpc(base);
          return;
        }
        // A feed that does not continue what we hold is a different history, and
        // saying so is the entire reason to keep a copy.
        if (res.reason === "fork" || res.reason === "wrong-earth") {
          setStatus("diverged");
          setNote(`${res.reason}: ${res.detail}`);
          setActiveRpc(base);
          return;
        }
        lastDetail = res.detail;
      } catch (e) {
        lastDetail = e instanceof Error ? e.message : "cannot keep a copy on this device";
      }
    }
    if (state) {
      setStatus("held");
      setNote(lastDetail);
    } else {
      setStatus("unavailable");
      setNote(lastDetail ?? "no tip mirror answered");
    }
  }, [rpc, expectGenesis, state]);

  useEffect(() => {
    void (async () => {
      try {
        const held = await idbMirrorStore().load();
        if (held) setState(mirrorState(held));
      } catch {
        setStatus("unavailable");
      }
      void sync();
    })();
    // Sync on mount and when the tip changes; the wallet polls often enough
    // that a timer here would only duplicate work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc]);

  const download = useCallback(() => {
    if (!state || state.pixels.length === 0) return;
    const html = exportMirrorHtml(state.pixels);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pixel-picture-${state.height}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const forget = useCallback(async () => {
    await clearMirror();
    setState(null);
    setStatus("idle");
    setActiveRpc(null);
  }, []);

  return { state, status, note, sync, download, forget, activeRpc };
}

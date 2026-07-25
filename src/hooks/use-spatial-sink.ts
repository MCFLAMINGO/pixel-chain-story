import { useEffect, useState } from "react";
import {
  buildSpatialPicture,
  buildSpatialSinkFromPicture,
  buildSpatialSinkScene,
  type PixelChainState,
  type SpatialSinkScene,
} from "@/lib/pixel";
import { defaultPixelRpc } from "@/lib/pixel-rpc";

export type SpatialSinkSource = "rpc" | "local" | "idle";

/**
 * Poll tip spatial snapshot (+ wave) for the Three.js UI sink.
 * Prefers RPC when available; falls back to local chain pixels.
 */
export function useSpatialSink(opts?: {
  rpcBase?: string;
  chain?: PixelChainState | null;
  pollMs?: number;
}) {
  const rpcBase = (opts?.rpcBase ?? defaultPixelRpc() ?? "").replace(/\/$/, "");
  const pollMs = opts?.pollMs ?? 2000;
  const chain = opts?.chain ?? null;
  const tipLen = chain?.pixels.length ?? 0;
  const tipHash = tipLen ? chain!.pixels[tipLen - 1]!.hash : "";
  const [scene, setScene] = useState<SpatialSinkScene | null>(null);
  const [source, setSource] = useState<SpatialSinkSource>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        if (rpcBase) {
          const [snapRes, waveRes] = await Promise.all([
            fetch(`${rpcBase}/spatial/snapshot`),
            fetch(`${rpcBase}/wave/tip`),
          ]);
          if (!snapRes.ok) throw new Error(`snapshot HTTP ${snapRes.status}`);
          const snapshot = (await snapRes.json()) as {
            spatialRoot: string;
            cells: Array<{
              index: number;
              x: number;
              y: number;
              z: number;
              color: string;
              key: string;
            }>;
          };
          const wave = waveRes.ok
            ? ((await waveRes.json()) as {
                tipIndex?: number;
                tipHash?: string;
                waveDigest?: string;
                hits?: Array<{
                  cellIndex: number;
                  hop: number;
                  amplitudeMilli: number;
                  leadIndex: number;
                }>;
              })
            : null;
          if (cancelled) return;
          setScene(buildSpatialSinkScene({ snapshot, wave }));
          setSource("rpc");
          setError(null);
          return;
        }

        if (chain?.pixels?.length) {
          const tip = chain.pixels[chain.pixels.length - 1]!;
          const picture = await buildSpatialPicture(chain.pixels);
          const next = await buildSpatialSinkFromPicture(picture, {
            tipIndex: tip.index,
            tipHash: tip.hash,
            waveDigest: tip.lightProof.waveDigest,
            hits: tip.wave,
          });
          if (cancelled) return;
          setScene(next);
          setSource("local");
          setError(null);
          return;
        }

        if (!cancelled) {
          setSource("idle");
          setScene(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [rpcBase, tipLen, tipHash, pollMs, chain]);

  return { scene, source, error, rpcBase: rpcBase || null };
}

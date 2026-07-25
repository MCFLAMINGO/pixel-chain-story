/**
 * Wave fan-out bus (SPATIAL S4) — event-driven propagation on the node.
 *
 * After a tip is illuminated or accepted, subscribers receive wave hits
 * asynchronously. This is a **local notify plane**, not consensus truth.
 *
 * Peers still recompute `waveDigest` via `assertWaveDigestMatch` on accept.
 * Forged bus payloads cannot rewrite the tip.
 */

import type { WaveHit } from "./wave";

export type WaveFanoutSource = "sequence" | "accept" | "replace";

export type WaveFanoutEvent = {
  tipIndex: number;
  tipHash: string;
  waveDigest: string;
  hits: WaveHit[];
  source: WaveFanoutSource;
  /** Wall clock for UI / ops — not bound into PoLS */
  at: number;
};

export type WaveFanoutListener = (event: WaveFanoutEvent) => void;

export type WaveBus = {
  /** Subscribe; returns unsubscribe. Fan-out is async (queueMicrotask). */
  on(listener: WaveFanoutListener): () => void;
  /** Schedule fan-out after tip path returns — never blocks accept/sequence. */
  emit(event: WaveFanoutEvent): void;
  /** Last emitted event (sync snapshot for RPC). */
  last(): WaveFanoutEvent | null;
  /** Listener count (lab / selftest). */
  listenerCount(): number;
};

/** Build a fan-out event from an already tip-bound pixel (hits must match digest). */
export function waveFanoutFromPixel(
  pixel: {
    index: number;
    hash: string;
    wave?: WaveHit[];
    lightProof: { waveDigest: string };
  },
  source: WaveFanoutSource,
): WaveFanoutEvent {
  return {
    tipIndex: pixel.index,
    tipHash: pixel.hash,
    waveDigest: pixel.lightProof.waveDigest,
    hits: pixel.wave ? pixel.wave.map((h) => ({ ...h })) : [],
    source,
    at: Date.now(),
  };
}

export function createWaveBus(): WaveBus {
  const listeners = new Set<WaveFanoutListener>();
  let lastEvent: WaveFanoutEvent | null = null;

  return {
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(event) {
      lastEvent = event;
      const snapshot = [...listeners];
      queueMicrotask(() => {
        for (const listener of snapshot) {
          try {
            listener(event);
          } catch (err) {
            console.error("[wave-bus] listener error", err);
          }
        }
      });
    },
    last() {
      return lastEvent;
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

export function waveFanoutThesis(): string {
  return (
    "Wave fan-out invents an async/event-driven notify plane on the node after tip " +
    "illuminate or accept: subscribers see wave hits without blocking PoLS. " +
    "Tip-recomputable only — acceptBlock still recomputes waveDigest; the bus is not a " +
    "second consensus truth."
  );
}

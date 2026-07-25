/**
 * Canonical tip host contract — what production `/` and `/wallet` need.
 *
 * Lab invent for “hosted public tip as production default”: a tip URL must
 * answer this surface with a stable canvas. Not a claim of humanity mainnet.
 */

export type TipHealth = {
  ok?: boolean;
  genesisHash?: string;
  canvasId?: string;
  networkId?: number;
  tip?: number;
  tipHash?: string;
  pixels?: number;
};

export type TipHostCheck = {
  ok: boolean;
  reason?: string;
  canvasId?: string;
  genesisHash?: string;
  tip?: number;
};

/** Validate GET /health shape for a durable tip feed. */
export function assertTipHealth(health: TipHealth): TipHostCheck {
  if (!health || health.ok !== true) {
    return { ok: false, reason: "health.ok !== true" };
  }
  if (!health.genesisHash || health.genesisHash.length < 64) {
    return { ok: false, reason: "missing genesisHash" };
  }
  if (!health.canvasId || !health.canvasId.includes(":")) {
    return { ok: false, reason: "missing canvasId" };
  }
  if (typeof health.networkId !== "number") {
    return { ok: false, reason: "missing networkId" };
  }
  if (typeof health.tip !== "number" || health.tip < 0) {
    return { ok: false, reason: "missing tip height" };
  }
  return {
    ok: true,
    canvasId: health.canvasId,
    genesisHash: health.genesisHash,
    tip: health.tip,
  };
}

/** Validate spatial snapshot is tip-bound (S3 surface for public tip). */
export function assertTipSpatialSnapshot(snap: {
  spatialRoot?: string;
  cells?: unknown[];
}): TipHostCheck {
  if (!snap?.spatialRoot || snap.spatialRoot.length < 64) {
    return { ok: false, reason: "spatialRoot missing" };
  }
  if (!Array.isArray(snap.cells)) {
    return { ok: false, reason: "cells missing" };
  }
  return { ok: true };
}

/** Validate wave tip notify/field surface (S4). */
export function assertTipWaveField(wave: {
  tipIndex?: number;
  waveDigest?: string;
  hits?: unknown[];
}): TipHostCheck {
  if (typeof wave?.tipIndex !== "number") {
    return { ok: false, reason: "wave tipIndex missing" };
  }
  if (!wave.waveDigest || wave.waveDigest.length < 64) {
    return { ok: false, reason: "waveDigest missing" };
  }
  if (!Array.isArray(wave.hits)) {
    return { ok: false, reason: "wave hits missing" };
  }
  return { ok: true };
}

/**
 * Probe a tip base URL for the production feed contract.
 * Used by CI selftest and ops readiness.
 */
export async function probeTipHost(baseUrl: string): Promise<TipHostCheck> {
  const base = baseUrl.replace(/\/$/, "");
  try {
    const healthRes = await fetch(`${base}/health`);
    if (!healthRes.ok) return { ok: false, reason: `health HTTP ${healthRes.status}` };
    const health = (await healthRes.json()) as TipHealth;
    const h = assertTipHealth(health);
    if (!h.ok) return h;

    const syncRes = await fetch(`${base}/sync`);
    if (!syncRes.ok) return { ok: false, reason: `sync HTTP ${syncRes.status}` };
    const sync = (await syncRes.json()) as { genesisHash?: string; canvasId?: string };
    if (sync.genesisHash !== health.genesisHash) {
      return { ok: false, reason: "sync genesisHash ≠ health" };
    }

    const snapRes = await fetch(`${base}/spatial/snapshot`);
    if (!snapRes.ok) return { ok: false, reason: `spatial HTTP ${snapRes.status}` };
    const snap = await snapRes.json();
    const s = assertTipSpatialSnapshot(snap);
    if (!s.ok) return s;

    const waveRes = await fetch(`${base}/wave/tip`);
    if (!waveRes.ok) return { ok: false, reason: `wave HTTP ${waveRes.status}` };
    const wave = await waveRes.json();
    const w = assertTipWaveField(wave);
    if (!w.ok) return w;

    return h;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export function tipHostThesis(): string {
  return (
    "Canonical tip host invents a production feed contract: durable datadir, stable " +
    "canvasId/genesisHash, /health /sync /pixels /tx plus spatial + wave surfaces. " +
    "Site builds with VITE_PIXEL_RPC point at that tip. Dream ≠ humanity mainnet claim " +
    "until the hosted tip is the production default with evidence green."
  );
}

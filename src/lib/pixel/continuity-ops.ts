/**
 * Continuity ops — operator ladder for small-store mirrors (lab).
 *
 * Honesty: this is the wizard UI + digest/rung bookkeeping.
 * Real VPS nginx/rsync/DNS still run on your hosts; Pixel holds
 * the map (digest) and later the till. Not ICP compute.
 */

import { sha512Hex, type Hex } from "./crypto";

export type ContinuityStep =
  | "draft"
  | "invite_sent"
  | "merchant_joined"
  | "rungs_assigned"
  | "live";

export type RungHealth = "unknown" | "up" | "down";

export interface MirrorRung {
  id: string;
  label: string;
  /** Base URL where this rung serves sites, e.g. https://m1.example.com */
  baseUrl: string;
  provider: string;
  health: RungHealth;
  lastCheckedAt?: number;
}

export interface ContinuityStore {
  id: string;
  /** Business display name */
  name: string;
  /** Public domain customers type */
  domain: string;
  /** Origin booth (their current host) */
  originUrl: string;
  /** Monthly price you charge (USD), display only */
  priceUsdPerMonth: number;
  /** Secure invite token for merchant link */
  inviteToken: string;
  step: ContinuityStep;
  /** sha512 of mirrored artifact (map of the real room) */
  digest?: Hex;
  /** Rung ids assigned to this store */
  rungIds: string[];
  /** When merchant accepted the invite */
  joinedAt?: number;
  createdAt: number;
  updatedAt: number;
  note?: string;
}

export interface ContinuityOpsState {
  operatorName: string;
  rungs: MirrorRung[];
  stores: ContinuityStore[];
}

export const CONTINUITY_OPS_KEY = "pixel.continuity.ops.v1";

export function defaultRungs(): MirrorRung[] {
  return [
    {
      id: "rung-1",
      label: "Rung 1 — EU",
      baseUrl: "https://rung1.example.invalid",
      provider: "Hetzner",
      health: "unknown",
    },
    {
      id: "rung-2",
      label: "Rung 2 — US",
      baseUrl: "https://rung2.example.invalid",
      provider: "Vultr",
      health: "unknown",
    },
    {
      id: "rung-3",
      label: "Rung 3 — AI cloud",
      baseUrl: "https://rung3.example.invalid",
      provider: "Nebius",
      health: "unknown",
    },
    {
      id: "rung-4",
      label: "Rung 4 — Alt",
      baseUrl: "https://rung4.example.invalid",
      provider: "Other VPS",
      health: "unknown",
    },
    {
      id: "rung-5",
      label: "Rung 5 — Home/colo",
      baseUrl: "https://rung5.example.invalid",
      provider: "Private",
      health: "unknown",
    },
  ];
}

export function emptyOpsState(operatorName = "McFlamingo Continuity"): ContinuityOpsState {
  return {
    operatorName,
    rungs: defaultRungs(),
    stores: [],
  };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Step 1 — create a store offer (admin). */
export function createStoreOffer(
  state: ContinuityOpsState,
  input: { name: string; domain: string; originUrl: string; priceUsdPerMonth?: number },
): ContinuityOpsState {
  const now = Date.now();
  const store: ContinuityStore = {
    id: id("store"),
    name: input.name.trim(),
    domain: input.domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, ""),
    originUrl: input.originUrl.trim() || `https://${input.domain.trim()}`,
    priceUsdPerMonth: input.priceUsdPerMonth ?? 20,
    inviteToken: randomToken(),
    step: "draft",
    rungIds: [],
    createdAt: now,
    updatedAt: now,
  };
  return { ...state, stores: [store, ...state.stores] };
}

/** Step 2 — mark invite sent (admin copied secure link). */
export function markInviteSent(state: ContinuityOpsState, storeId: string): ContinuityOpsState {
  return patchStore(state, storeId, { step: "invite_sent" });
}

/**
 * Step 3 — merchant accepts invite (secure link).
 * They confirm origin + artifact digest of the snapshot they approve.
 */
export function merchantJoin(
  state: ContinuityOpsState,
  inviteToken: string,
  input: { originUrl: string; digest: Hex; note?: string },
): ContinuityOpsState {
  const store = state.stores.find((s) => s.inviteToken === inviteToken);
  if (!store) throw new Error("Invite not found or expired");
  if (store.step === "live") throw new Error("Store already live");
  return patchStore(state, store.id, {
    originUrl: input.originUrl.trim(),
    digest: input.digest,
    note: input.note,
    step: "merchant_joined",
    joinedAt: Date.now(),
  });
}

/** Step 4 — assign mirror rungs (admin). */
export function assignRungs(
  state: ContinuityOpsState,
  storeId: string,
  rungIds: string[],
): ContinuityOpsState {
  if (rungIds.length < 1) throw new Error("Assign at least one rung");
  for (const rid of rungIds) {
    if (!state.rungs.some((r) => r.id === rid)) throw new Error(`Unknown rung ${rid}`);
  }
  return patchStore(state, storeId, { rungIds: [...rungIds], step: "rungs_assigned" });
}

/** Step 5 — go live after rungs assigned + digest present. */
export function goLive(state: ContinuityOpsState, storeId: string): ContinuityOpsState {
  const store = state.stores.find((s) => s.id === storeId);
  if (!store) throw new Error("Store not found");
  if (!store.digest) throw new Error("Need artifact digest before live");
  if (store.rungIds.length < 1) throw new Error("Assign rungs before live");
  return patchStore(state, storeId, { step: "live" });
}

export function updateRung(
  state: ContinuityOpsState,
  rungId: string,
  patch: Partial<Pick<MirrorRung, "label" | "baseUrl" | "provider">>,
): ContinuityOpsState {
  return {
    ...state,
    rungs: state.rungs.map((r) => (r.id === rungId ? { ...r, ...patch } : r)),
  };
}

/** Health probe — fetch rung base (lab; opaque CORS may mark unknown). */
export async function probeRung(rung: MirrorRung): Promise<MirrorRung> {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(rung.baseUrl, {
      method: "GET",
      mode: "cors",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return {
      ...rung,
      health: res.ok || res.status === 404 || res.status === 403 ? "up" : "down",
      lastCheckedAt: Date.now(),
    };
  } catch {
    // Many rungs block browser CORS — treat as unknown, not down.
    const elapsed = Date.now() - started;
    return {
      ...rung,
      health: elapsed >= 3900 ? "down" : "unknown",
      lastCheckedAt: Date.now(),
    };
  }
}

export async function digestArtifactText(text: string): Promise<Hex> {
  return sha512Hex(text);
}

export async function digestArtifactFile(file: Blob): Promise<Hex> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return sha512Hex(buf);
}

export function storeByInvite(
  state: ContinuityOpsState,
  token: string,
): ContinuityStore | undefined {
  return state.stores.find((s) => s.inviteToken === token);
}

export function stepIndex(step: ContinuityStep): number {
  const order: ContinuityStep[] = [
    "draft",
    "invite_sent",
    "merchant_joined",
    "rungs_assigned",
    "live",
  ];
  return order.indexOf(step);
}

export function stepLabel(step: ContinuityStep): string {
  switch (step) {
    case "draft":
      return "1 · Offer created";
    case "invite_sent":
      return "2 · Invite sent";
    case "merchant_joined":
      return "3 · Merchant joined";
    case "rungs_assigned":
      return "4 · Rungs assigned";
    case "live":
      return "5 · Live on ladder";
  }
}

function patchStore(
  state: ContinuityOpsState,
  storeId: string,
  patch: Partial<ContinuityStore>,
): ContinuityOpsState {
  return {
    ...state,
    stores: state.stores.map((s) =>
      s.id === storeId ? { ...s, ...patch, updatedAt: Date.now() } : s,
    ),
  };
}

export function continuityThesis(): string {
  return "You sell the map + till + ladder matching. Rungs are booths you (or others) run — not a second AWS monopoly.";
}

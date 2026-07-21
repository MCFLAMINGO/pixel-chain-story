/**
 * Portable Continuity invite packs — cross-phone without claiming cloud magic.
 *
 * Operator exports a pack; merchant (or second device) imports it into local ops.
 * Node-backed invites (GET /continuity/invite/:token) are the always-on path when a
 * Pixel node holds Continuity ops — packs work offline / AirDrop / paste.
 */

import {
  emptyOpsState,
  merchantOfferCopy,
  type ContinuityOpsState,
  type ContinuityStore,
  type MirrorRung,
} from "./continuity-ops";

export const INVITE_PACK_KIND = "pixel.continuity.invite" as const;
export const INVITE_PACK_VERSION = 1 as const;

export interface ContinuityInvitePack {
  v: typeof INVITE_PACK_VERSION;
  kind: typeof INVITE_PACK_KIND;
  createdAt: number;
  store: ContinuityStore;
  /** Rungs referenced by the store (subset). */
  rungs: MirrorRung[];
  /** Always paired with Continuity pitches — verification / map / custody. */
  discipline: string;
  offer: string;
}

export function continuityDisciplineLine(): string {
  return "Settlement and the Continuity map live on Pixel. Your live menu can still open on your host — Pixel does not host the internet.";
}

/** Pair a usefulness sentence with the discipline line so Continuity never cheapens Pixel. */
export function continuityPitchPair(usefulness: string): string {
  const u = usefulness.trim().replace(/\s+/g, " ");
  return `${u} ${continuityDisciplineLine()}`;
}

export function buildInvitePack(state: ContinuityOpsState, storeId: string): ContinuityInvitePack {
  const store = state.stores.find((s) => s.id === storeId);
  if (!store) throw new Error("Store not found");
  const rungs = state.rungs.filter((r) => store.rungIds.includes(r.id));
  return {
    v: INVITE_PACK_VERSION,
    kind: INVITE_PACK_KIND,
    createdAt: Date.now(),
    store: structuredClone(store),
    rungs: structuredClone(rungs),
    discipline: continuityDisciplineLine(),
    offer: merchantOfferCopy(store),
  };
}

export function encodeInvitePack(pack: ContinuityInvitePack): string {
  const json = JSON.stringify(pack);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeInvitePack(raw: string): ContinuityInvitePack {
  const trimmed = raw.trim();
  let json: string;
  if (trimmed.startsWith("{")) {
    json = trimmed;
  } else {
    const b64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(b64 + pad, "base64").toString("utf8");
    } else {
      const bin = atob(b64 + pad);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      json = new TextDecoder().decode(bytes);
    }
  }
  const pack = JSON.parse(json) as ContinuityInvitePack;
  assertInvitePack(pack);
  return pack;
}

export function assertInvitePack(pack: unknown): asserts pack is ContinuityInvitePack {
  if (!pack || typeof pack !== "object") throw new Error("Invite pack must be an object");
  const p = pack as ContinuityInvitePack;
  if (p.kind !== INVITE_PACK_KIND) throw new Error("Not a Continuity invite pack");
  if (p.v !== INVITE_PACK_VERSION) throw new Error(`Unsupported invite pack version ${p.v}`);
  if (!p.store?.inviteToken || !p.store?.id || !p.store?.domain) {
    throw new Error("Invite pack missing store identity");
  }
  if (!Array.isArray(p.rungs)) throw new Error("Invite pack missing rungs");
}

/**
 * Merge a pack into local ops so `/continuity/join/$token` works on this device.
 * Replaces same id / same inviteToken; adds missing rungs by id.
 */
export function importInvitePack(
  state: ContinuityOpsState,
  pack: ContinuityInvitePack,
): ContinuityOpsState {
  assertInvitePack(pack);
  const rungsById = new Map(state.rungs.map((r) => [r.id, r]));
  for (const r of pack.rungs) rungsById.set(r.id, r);
  const stores = state.stores.filter(
    (s) => s.id !== pack.store.id && s.inviteToken !== pack.store.inviteToken,
  );
  return {
    ...state,
    rungs: [...rungsById.values()],
    stores: [{ ...pack.store, updatedAt: Date.now() }, ...stores],
  };
}

/** Public invite view — safe to expose on GET /continuity/invite/:token (no secrets). */
export function publicInviteView(store: ContinuityStore): {
  name: string;
  domain: string;
  inviteToken: string;
  offer: string;
  discipline: string;
  step: ContinuityStore["step"];
  originUrl: string;
  anchoredOnPixel?: boolean;
  registerRef?: string;
  pixelIndex?: number;
} {
  return {
    name: store.name,
    domain: store.domain,
    inviteToken: store.inviteToken,
    offer: merchantOfferCopy(store),
    discipline: continuityDisciplineLine(),
    step: store.step,
    originUrl: store.originUrl,
    anchoredOnPixel: store.anchoredOnPixel,
    registerRef: store.registerRef,
    pixelIndex: store.pixelIndex,
  };
}

export function emptyOpsWithPack(pack: ContinuityInvitePack): ContinuityOpsState {
  return importInvitePack(emptyOpsState("Continuity"), pack);
}

/**
 * Tip mirror list — discovery convenience, not consensus.
 *
 * One Railway URL must not be the only way to find the crowned tip. This module
 * loads `tip-mirrors.json` (or a caller-supplied path) and tries HTTP `/sync`
 * endpoints in order until one returns a verifying chain.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CROWNED_GENESIS_HASH,
  CROWNED_NETWORK_ID,
  PUBLIC_TIP_RPC_DEFAULT,
  assertCrownedPublicTip,
} from "./crowned-genesis";
import type { LedgerPixel } from "./chain";
import type { SequencerId } from "./chain";

export interface TipMirrorEntry {
  id: string;
  rpc: string;
  role?: "primary" | "mirror" | "archive";
  note?: string;
}

export interface TipMirrorsFile {
  networkId: number;
  genesisHash: string;
  genesisPrefix?: string;
  mirrors: TipMirrorEntry[];
  gossipSeeds?: string[];
}

export interface TipSyncPayload {
  pixels: LedgerPixel[];
  sequencers?: SequencerId[];
  networkId?: number;
  gossipUrl?: string | null;
  address?: string;
  publicKey?: string;
  genesisHash?: string;
  sourceRpc: string;
  sourceId?: string;
}

export class TipMirrorError extends Error {
  constructor(
    message: string,
    readonly attempts: Array<{ rpc: string; error: string }>,
  ) {
    super(message);
    this.name = "TipMirrorError";
  }
}

const DEFAULT_MIRRORS_PATH = join(import.meta.dir, "../../../tip-mirrors.json");

export function defaultTipMirrorsPath(): string {
  return DEFAULT_MIRRORS_PATH;
}

export function parseTipMirrors(raw: unknown): TipMirrorsFile {
  if (!raw || typeof raw !== "object") throw new Error("tip-mirrors: root must be an object");
  const o = raw as Record<string, unknown>;
  if (typeof o.networkId !== "number") throw new Error("tip-mirrors: networkId required");
  if (typeof o.genesisHash !== "string") throw new Error("tip-mirrors: genesisHash required");
  if (!Array.isArray(o.mirrors) || o.mirrors.length === 0) {
    throw new Error("tip-mirrors: mirrors[] must be a non-empty array");
  }
  const mirrors: TipMirrorEntry[] = [];
  for (const m of o.mirrors) {
    if (!m || typeof m !== "object") throw new Error("tip-mirrors: bad mirror entry");
    const e = m as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.rpc !== "string") {
      throw new Error("tip-mirrors: each mirror needs id + rpc");
    }
    mirrors.push({
      id: e.id,
      rpc: e.rpc.replace(/\/$/, ""),
      role: e.role as TipMirrorEntry["role"],
      note: typeof e.note === "string" ? e.note : undefined,
    });
  }
  const gossipSeeds = Array.isArray(o.gossipSeeds)
    ? o.gossipSeeds.filter((s): s is string => typeof s === "string")
    : [];
  return {
    networkId: o.networkId,
    genesisHash: o.genesisHash,
    genesisPrefix: typeof o.genesisPrefix === "string" ? o.genesisPrefix : undefined,
    mirrors,
    gossipSeeds,
  };
}

export function loadTipMirrors(path: string = defaultTipMirrorsPath()): TipMirrorsFile {
  return parseTipMirrors(JSON.parse(readFileSync(path, "utf8")));
}

/** Built-in fallback when the file is missing — still one entry, but typed. */
export function builtinTipMirrors(): TipMirrorsFile {
  return {
    networkId: CROWNED_NETWORK_ID,
    genesisHash: CROWNED_GENESIS_HASH,
    genesisPrefix: "f1d193f62d54e982",
    mirrors: [
      {
        id: "railway-primary",
        rpc: PUBLIC_TIP_RPC_DEFAULT,
        role: "primary",
      },
    ],
    gossipSeeds: [],
  };
}

export function loadTipMirrorsOrBuiltin(path?: string): TipMirrorsFile {
  try {
    return loadTipMirrors(path ?? defaultTipMirrorsPath());
  } catch {
    return builtinTipMirrors();
  }
}

export async function fetchTipSync(rpc: string): Promise<Omit<TipSyncPayload, "sourceRpc" | "sourceId">> {
  const base = rpc.replace(/\/$/, "");
  const syncRes = await fetch(`${base}/sync`);
  if (syncRes.ok) {
    const sync = (await syncRes.json()) as Omit<TipSyncPayload, "sourceRpc" | "sourceId">;
    if (!sync.pixels?.length) throw new Error("peer returned no pixels");
    return sync;
  }
  const pixels = (await fetch(`${base}/pixels`).then((r) => {
    if (!r.ok) throw new Error(`/pixels HTTP ${r.status}`);
    return r.json();
  })) as LedgerPixel[];
  const health = (await fetch(`${base}/health`).then((r) => {
    if (!r.ok) throw new Error(`/health HTTP ${r.status}`);
    return r.json();
  })) as {
    address: string;
    publicKey?: string;
    gossipUrl?: string;
    genesisHash?: string;
    networkId?: number;
  };
  if (!pixels?.length) throw new Error("peer returned no pixels");
  return {
    pixels,
    gossipUrl: health.gossipUrl,
    address: health.address,
    publicKey: health.publicKey,
    genesisHash: health.genesisHash,
    networkId: health.networkId,
  };
}

export interface JoinViaMirrorsOpts {
  /** Explicit single peer — tried first, then mirrors (excluding duplicates). */
  peer?: string;
  mirrorsPath?: string;
  mirrors?: TipMirrorsFile;
  requireCrowned?: boolean;
  /** Per-attempt timeout ms. */
  timeoutMs?: number;
}

/**
 * Try peer (if any) then each mirror until one returns pixels.
 * Does not verify the chain — caller runs verifyChain before saving.
 */
export async function fetchSyncViaMirrors(opts: JoinViaMirrorsOpts = {}): Promise<TipSyncPayload> {
  const list = opts.mirrors ?? loadTipMirrorsOrBuiltin(opts.mirrorsPath);
  const seen = new Set<string>();
  const queue: Array<{ id?: string; rpc: string }> = [];
  if (opts.peer) {
    const rpc = opts.peer.replace(/\/$/, "");
    queue.push({ id: "cli-peer", rpc });
    seen.add(rpc);
  }
  for (const m of list.mirrors) {
    const rpc = m.rpc.replace(/\/$/, "");
    if (seen.has(rpc)) continue;
    seen.add(rpc);
    queue.push({ id: m.id, rpc });
  }
  if (queue.length === 0) {
    throw new TipMirrorError("no tip mirrors or --peer to try", []);
  }

  const attempts: Array<{ rpc: string; error: string }> = [];
  const timeoutMs = opts.timeoutMs ?? 15_000;

  for (const entry of queue) {
    try {
      const sync = await Promise.race([
        fetchTipSync(entry.rpc),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      const genesisHash = sync.genesisHash ?? sync.pixels[0]!.hash;
      const networkId = sync.networkId ?? list.networkId;
      if (opts.requireCrowned) {
        assertCrownedPublicTip({ genesisHash, networkId });
      }
      return { ...sync, genesisHash, networkId, sourceRpc: entry.rpc, sourceId: entry.id };
    } catch (err) {
      attempts.push({ rpc: entry.rpc, error: err instanceof Error ? err.message : String(err) });
    }
  }

  throw new TipMirrorError(
    `no tip mirror answered (${attempts.length} attempt(s)): ${attempts
      .map((a) => `${a.rpc} → ${a.error}`)
      .join("; ")}`,
    attempts,
  );
}

export function tipMirrorsThesis(): {
  claim: string;
  green: string[];
  red: string[];
} {
  return {
    claim:
      "Tip URLs are discovery cattle. Consensus is the verifying fold over pixels — not which host answered /sync.",
    green: [
      "join can try more than one HTTP mirror",
      "crowned genesis + network id still bound when require-crowned",
    ],
    red: [
      "a single mirror in tip-mirrors.json is still a practical SPOF until more hosts exist",
      "gossipSeeds empty until operators advertise publicly",
    ],
  };
}

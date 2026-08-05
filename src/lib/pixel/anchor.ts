/**
 * Tip anchoring — tamper-evidence without custody.
 *
 * Pixel publishes (networkId, pixelIndex, tipHash, spatialRoot) to one or more
 * external, timestamped, append-only venues. Anyone handed a Pixel history can
 * then check it against what was published, and cannot be shown a history that
 * was quietly rewritten behind an anchor.
 *
 * Deliberately venue-agnostic: `anchorDigest` is the portable unit, byte-identical
 * to `PixelAnchor.anchorDigest` in Solidity, so the same record can go to an EVM
 * chain, a Bitcoin OP_RETURN, IPFS, or a signed tag. No venue is privileged —
 * that is the same rule the bridge doctrine already states.
 *
 * HONEST BOUNDS. Anchoring proves publication time and immutability-after-the-fact.
 * It does NOT prove the anchored root is correct: an anchorer can publish a root
 * for an invalid chain. Detection needs (a) at least one independent archive of
 * Pixel history, and (b) ideally the same record on more than one venue so the
 * venues can be compared against each other.
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, canonicalizeHex, hexToBytes, type Hex } from "./crypto";
import type { PixelChainState } from "./chain";

/** SHA-512 digests from Pixel are 64 bytes / 128 hex chars. */
export const PIXEL_DIGEST_BYTES = 64;
export const PIXEL_DIGEST_HEX = PIXEL_DIGEST_BYTES * 2;

export interface PixelAnchorRecord {
  networkId: number;
  pixelIndex: number;
  /** Block hash of the anchored pixel (SHA-512 hex). */
  tipHash: Hex;
  /** Illuminated-picture root at that height (SHA-512 hex). */
  spatialRoot: Hex;
}

export type AnchorVenueKind = "evm" | "bitcoin" | "ipfs" | "file" | "other";

/** Where an anchor was actually published, and when the venue says so. */
export interface PublishedAnchor extends PixelAnchorRecord {
  venueId: string;
  venueKind: AnchorVenueKind;
  digest: Hex;
  /** Venue-attested time (block timestamp, file mtime, …) in ms. */
  anchoredAtMs: number;
  /** Venue-native locator: tx hash, CID, path. */
  reference: string;
}

/**
 * A publication target. Anything that can hold 32 bytes immutably with a
 * timestamp qualifies — the interface is deliberately this small.
 */
export interface AnchorVenue {
  id: string;
  kind: AnchorVenueKind;
  publish: (record: PixelAnchorRecord) => Promise<PublishedAnchor>;
  fetch: (networkId: number, pixelIndex: number) => Promise<PublishedAnchor | null>;
}

function u64be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`anchor: expected a non-negative integer (got ${value})`);
  }
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), false);
  return out;
}

function digestBytes(hex: Hex, label: string): Uint8Array {
  const clean = canonicalizeHex(hex);
  if (clean.length !== PIXEL_DIGEST_HEX) {
    throw new Error(
      `anchor: ${label} must be ${PIXEL_DIGEST_HEX} hex chars (got ${clean.length}) — no padding or truncation`,
    );
  }
  return hexToBytes(clean);
}

/**
 * Portable 32-byte commitment to an anchor record.
 * Layout: networkId(8) ‖ pixelIndex(8) ‖ tipHash(64) ‖ spatialRoot(64).
 */
export function anchorDigest(record: PixelAnchorRecord): Hex {
  const buf = new Uint8Array(8 + 8 + PIXEL_DIGEST_BYTES * 2);
  buf.set(u64be(record.networkId), 0);
  buf.set(u64be(record.pixelIndex), 8);
  buf.set(digestBytes(record.tipHash, "tipHash"), 16);
  buf.set(digestBytes(record.spatialRoot, "spatialRoot"), 16 + PIXEL_DIGEST_BYTES);
  return bytesToHex(keccak_256(buf));
}

/** Anchor record for the current tip. */
export function buildAnchorFromState(state: PixelChainState): PixelAnchorRecord {
  const tip = state.pixels[state.pixels.length - 1];
  if (!tip) throw new Error("anchor: chain has no pixels");
  return {
    networkId: state.networkId,
    pixelIndex: tip.index,
    tipHash: tip.hash,
    spatialRoot: tip.lightProof.spatialRoot,
  };
}

/** Anchor record for a specific height. */
export function buildAnchorAt(state: PixelChainState, pixelIndex: number): PixelAnchorRecord {
  const pixel = state.pixels[pixelIndex];
  if (!pixel || pixel.index !== pixelIndex) {
    throw new Error(`anchor: no pixel at height ${pixelIndex}`);
  }
  return {
    networkId: state.networkId,
    pixelIndex,
    tipHash: pixel.hash,
    spatialRoot: pixel.lightProof.spatialRoot,
  };
}

export type AnchorCheck =
  | { ok: true; pixelIndex: number }
  | { ok: false; reason: string; pixelIndex: number };

/**
 * Does our copy of the chain agree with what was published?
 *
 * A mismatch is the alarm this whole mechanism exists to raise: either the
 * history we hold was rewritten, or the anchorer published something false.
 */
export function verifyAnchorAgainstChain(
  published: PixelAnchorRecord,
  state: PixelChainState,
): AnchorCheck {
  const { pixelIndex } = published;
  if (published.networkId !== state.networkId) {
    return {
      ok: false,
      pixelIndex,
      reason: `anchor is for network ${published.networkId}, this chain is ${state.networkId}`,
    };
  }
  const pixel = state.pixels[pixelIndex];
  if (!pixel || pixel.index !== pixelIndex) {
    return { ok: false, pixelIndex, reason: `no local pixel at height ${pixelIndex}` };
  }
  if (pixel.hash !== published.tipHash) {
    return {
      ok: false,
      pixelIndex,
      reason: `tip hash diverges at #${pixelIndex} — local history was rewritten or the anchor is false`,
    };
  }
  if (pixel.lightProof.spatialRoot !== published.spatialRoot) {
    return {
      ok: false,
      pixelIndex,
      reason: `illuminated picture diverges at #${pixelIndex}`,
    };
  }
  return { ok: true, pixelIndex };
}

export type VenueAgreement =
  | { agreed: true; pixelIndex: number; digest: Hex; venues: string[] }
  | { agreed: false; pixelIndex: number; reason: string; byDigest: Record<string, string[]> };

/**
 * Compare the same height across venues.
 *
 * One venue is a single point of failure for liveness and for honesty. Two that
 * agree is meaningfully stronger; two that disagree is a loud, early alarm.
 */
export function compareVenues(published: PublishedAnchor[]): VenueAgreement {
  if (published.length === 0) {
    return { agreed: false, pixelIndex: -1, reason: "no anchors supplied", byDigest: {} };
  }
  const pixelIndex = published[0]!.pixelIndex;
  const byDigest: Record<string, string[]> = {};
  for (const entry of published) {
    if (entry.pixelIndex !== pixelIndex) {
      return {
        agreed: false,
        pixelIndex,
        reason: `mixed heights: ${entry.venueId} anchored #${entry.pixelIndex}`,
        byDigest,
      };
    }
    const expected = anchorDigest(entry);
    if (expected !== entry.digest) {
      return {
        agreed: false,
        pixelIndex,
        reason: `${entry.venueId} published a digest that does not match its own record`,
        byDigest,
      };
    }
    (byDigest[entry.digest] ??= []).push(entry.venueId);
  }
  const digests = Object.keys(byDigest);
  if (digests.length > 1) {
    return {
      agreed: false,
      pixelIndex,
      reason: `venues disagree at #${pixelIndex} — ${digests.length} distinct digests`,
      byDigest,
    };
  }
  return {
    agreed: true,
    pixelIndex,
    digest: digests[0]! as Hex,
    venues: byDigest[digests[0]!]!,
  };
}

/** Publish one record to every venue; per-venue failures are reported, not thrown. */
export async function publishToAll(
  record: PixelAnchorRecord,
  venues: AnchorVenue[],
): Promise<{ published: PublishedAnchor[]; failures: Array<{ venueId: string; error: string }> }> {
  const publishedList: PublishedAnchor[] = [];
  const failures: Array<{ venueId: string; error: string }> = [];
  for (const venue of venues) {
    try {
      publishedList.push(await venue.publish(record));
    } catch (err) {
      failures.push({
        venueId: venue.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { published: publishedList, failures };
}

/** In-memory venue — tests, dry runs, and a local append-only journal. */
export function memoryAnchorVenue(id = "memory", kind: AnchorVenueKind = "file"): AnchorVenue {
  const store = new Map<string, PublishedAnchor>();
  const key = (n: number, i: number) => `${n}:${i}`;
  return {
    id,
    kind,
    publish: async (record) => {
      const k = key(record.networkId, record.pixelIndex);
      const existing = store.get(k);
      // Append-only, exactly like the contract: a height is written once.
      if (existing) throw new Error(`${id}: #${record.pixelIndex} already anchored`);
      const entry: PublishedAnchor = {
        ...record,
        venueId: id,
        venueKind: kind,
        digest: anchorDigest(record),
        anchoredAtMs: Date.now(),
        reference: `${id}#${record.pixelIndex}`,
      };
      store.set(k, entry);
      return entry;
    },
    fetch: async (networkId, pixelIndex) => store.get(key(networkId, pixelIndex)) ?? null,
  };
}

export function anchorThesis(): {
  proves: string;
  doesNotProve: string;
  custody: string;
  venues: string;
} {
  return {
    proves:
      "A tip hash and illuminated-picture root were published at a venue-attested time and never changed afterwards.",
    doesNotProve:
      "That the anchored root is correct. An anchorer can publish a root for an invalid chain; detection needs an independent archive to compare against.",
    custody: "No value is held, released, or bridged. There is nothing here to steal.",
    venues:
      "No privileged venue. The digest is portable across EVM chains, Bitcoin OP_RETURN, IPFS or signed tags; agreement across venues is the strength.",
  };
}

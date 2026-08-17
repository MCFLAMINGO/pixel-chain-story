/**
 * Pixel Light Protocol — cryptographic primitives.
 *
 * Hash-based constructions are used so the chain is quantum-resistant today
 * without needing a new programming language. Production can swap the
 * SignatureScheme for NIST ML-DSA / SLH-DSA via liboqs while keeping the
 * same transaction and PoLS interfaces (crypto-agility).
 *
 * PIX-HASH-OTS-128 is a Merkle window of one-time Lamport keys. Each sign
 * consumes one leaf. Local wallets advance `nextLeaf`; the ledger rejects
 * reuse of `(publicKey, leafIndex)` in `chain.ts` (consensus, not honor system).
 *
 * Sync SHA-512 uses @noble/hashes (browser-safe). Never import node:crypto
 * from modules that load in the Continuity desk / Vite client.
 */

import { sha512 as sha512Noble } from "@noble/hashes/sha2.js";
import {
  MAX_SIGNATURE_JSON_BYTES,
  parseMldsaSignatureJson,
  parseOtsSignatureJson,
} from "./validators";

export type Hex = string;

const textEncoder = new TextEncoder();

/** Number of one-time leaves under each master key (power of two). */
export const OTS_LEAF_COUNT = 32;

export function bytesToHex(bytes: Uint8Array): Hex {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Strip optional `0x`, validate charset, require even length, lowercase.
 * Use for commitments / address derivation (canonical wire form).
 */
export function canonicalizeHex(hex: Hex): Hex {
  if (typeof hex !== "string") throw new Error("canonicalizeHex: expected string");
  const normalized = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (normalized.length === 0) return "";
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`canonicalizeHex: non-hex input (${normalized.slice(0, 24)}…)`);
  }
  if (normalized.length % 2 !== 0) {
    throw new Error(`canonicalizeHex: odd length (${normalized.length})`);
  }
  return normalized.toLowerCase();
}

/**
 * Decode hex → bytes. Rejects non-hex; lowercases; odd length pads a leading `0`
 * (legacy byte decode). Prefer `canonicalizeHex` for commitment strings.
 */
/**
 * Hex to bytes.
 *
 * Returns `Uint8Array<ArrayBuffer>` rather than the wider `Uint8Array`, because
 * WebCrypto's `BufferSource` excludes `SharedArrayBuffer`-backed views and TypeScript
 * 5.7 started tracking that distinction. The array built here is always
 * `ArrayBuffer`-backed, so this narrows the type to the truth instead of casting it
 * away at eleven call sites.
 */
export function hexToBytes(hex: Hex): Uint8Array<ArrayBuffer> {
  if (typeof hex !== "string") throw new Error("hexToBytes: expected string");
  const normalized = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (normalized.length === 0) return new Uint8Array(0);
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`hexToBytes: non-hex input (${normalized.slice(0, 24)}…)`);
  }
  const lower = normalized.toLowerCase();
  const clean = lower.length % 2 === 0 ? lower : `0${lower}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function sha512(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-512", bytes as BufferSource);
  return new Uint8Array(digest);
}

export async function sha512Hex(data: Uint8Array | string): Promise<Hex> {
  return bytesToHex(await sha512(data));
}

/** Sync SHA-512 for PoLS lottery / wave / field digests (matches node:crypto). */
export function sha512Sync(data: Uint8Array | string): Uint8Array {
  const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
  return sha512Noble(bytes);
}

export function sha512SyncHex(data: Uint8Array | string): Hex {
  return bytesToHex(sha512Sync(data));
}

/**
 * Guarantee `ArrayBuffer` backing for a byte array of unknown provenance.
 *
 * WebCrypto's `BufferSource` excludes `SharedArrayBuffer`-backed views, and a public
 * function taking `Uint8Array` cannot know which it was handed. Copies only when the
 * input is not already plain-backed, so the common path costs a check rather than an
 * allocation — and the uncommon path is correct instead of a cast that would compile
 * and then throw inside the browser's crypto implementation.
 */
export function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
    ? (bytes as Uint8Array<ArrayBuffer>)
    : new Uint8Array(bytes);
}

/** Random bytes. `ArrayBuffer`-backed for WebCrypto — see `hexToBytes`. */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/** Deterministic address from a public key commitment (Merkle root). */
export async function addressFromPublicKey(publicKey: Hex): Promise<string> {
  const pk = canonicalizeHex(publicKey);
  const digest = sha512SyncHex(`pix-addr|${pk}`);
  return `pix1${digest.slice(0, 38)}`;
}

/** Bech32-ish lab address: pix1 + 38 lowercase hex chars (40 total after prefix). */
export function isPixelAddress(address: string): boolean {
  return /^pix1[a-f0-9]{38}$/.test(address);
}

export function assertPixelAddress(address: string, label = "address"): void {
  if (!isPixelAddress(address)) {
    throw new Error(
      `Invalid ${label}: expected pix1 + 38 hex chars (got ${JSON.stringify(address.slice(0, 48))})`,
    );
  }
}

/**
 * Compact hash-based one-time signature (Lamport-style on 128-bit digest)
 * under a Merkle window so an address can authorize multiple spends without
 * reusing a leaf.
 */
export type LightSchemeId = "PIX-HASH-OTS-128" | "PIX-ML-DSA-65";

export interface LightKeypair {
  /** Signature scheme — OTS (default lab) or NIST ML-DSA-65. */
  scheme?: LightSchemeId;
  seed: Hex;
  /** OTS: Merkle root. ML-DSA: public key bytes hex. */
  publicKey: Hex;
  address: string;
  /** Next unused OTS leaf index. Persist this with the wallet. Unused for ML-DSA. */
  nextLeaf: number;
  leafCount: number;
  /** Leaf public keys (OTS). Empty for ML-DSA. */
  leafPublicKeys: Hex[];
  /**
   * Private pairs for the *current* OTS leaf only (compat / debugging).
   * Signing always re-derives from seed + nextLeaf.
   */
  privatePairs: Hex[][];
  /** ML-DSA secret key bytes (hex). Absent for OTS. */
  secretKey?: Hex;
}

/**
 * Signed digest width (PIX-10).
 *
 * Was 128, which meant a colliding message pair cost a 2^64 birthday search.
 * At 256 bits the collision bound is 2^128 — the security level the scheme
 * name asserts. `PIX-HASH-OTS-128` names the 128-bit *security level*, the way
 * AES-128 does, not the digest width.
 */
const MSG_BITS = 256;
const CHUNK = 32;

/**
 * Domain tag for OTS payloads (PIX-16).
 *
 * Mirrors `signPixel`'s `pix-sig|<scheme>|` prefix so an OTS signature is bound
 * to its scheme instead of covering a bare message digest.
 */
export const OTS_SIG_DOMAIN = "pix-sig|PIX-HASH-OTS-128|";

/**
 * Exact bytes an OTS signature covers. Length-prefixed so an attacker cannot
 * shift a delimiter between fields to make two contexts hash alike.
 */
export function otsSignedPayload(message: string): string {
  return `${OTS_SIG_DOMAIN}${message.length}:${message}`;
}

function otsPayload(message: string): string {
  return otsSignedPayload(message);
}

function hashChainSync(seed: Uint8Array, label: string): Uint8Array {
  return sha512Sync(concatBytes(seed, textEncoder.encode(label)));
}

function deriveLeafSeedSync(master: Uint8Array, index: number): Uint8Array {
  return sha512Sync(concatBytes(master, textEncoder.encode(`ots-leaf|${index}`))).slice(0, 32);
}

/** Sync OTS leaf material — @noble SHA-512 in the hot loop (no serial await). */
function leafMaterialSync(
  master: Uint8Array,
  index: number,
): {
  privatePairs: Hex[][];
  leafPublicKey: Hex;
} {
  const s = deriveLeafSeedSync(master, index);
  const privatePairs: Hex[][] = [];
  const publicParts: string[] = [];

  for (let i = 0; i < MSG_BITS; i++) {
    const zero = hashChainSync(s, `sk|${i}|0`);
    const one = hashChainSync(s, `sk|${i}|1`);
    privatePairs.push([bytesToHex(zero.slice(0, CHUNK)), bytesToHex(one.slice(0, CHUNK))]);
    // Full 64-hex-char halves. Truncating to 16 left a 64-bit second-preimage
    // target under an already-revealed leaf (PIX-10).
    const pz = sha512SyncHex(zero.slice(0, CHUNK));
    const po = sha512SyncHex(one.slice(0, CHUNK));
    publicParts.push(`${pz.slice(0, 64)}${po.slice(0, 64)}`);
  }

  const leafPublicKey = sha512SyncHex(publicParts.join("|"));
  return { privatePairs, leafPublicKey };
}

async function leafMaterial(
  master: Uint8Array,
  index: number,
): Promise<{
  privatePairs: Hex[][];
  leafPublicKey: Hex;
}> {
  return leafMaterialSync(master, index);
}

function merkleRootFromLeavesSync(leaves: Hex[]): { root: Hex; layers: Hex[][] } {
  if (leaves.length === 0) throw new Error("empty merkle");
  let layer = [...leaves];
  const layers: Hex[][] = [layer];
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left;
      next.push(sha512SyncHex(`ots-merkle|${left}|${right}`));
    }
    layer = next;
    layers.push(layer);
  }
  return { root: layer[0]!, layers };
}

async function merkleRootFromLeaves(leaves: Hex[]): Promise<{ root: Hex; layers: Hex[][] }> {
  return merkleRootFromLeavesSync(leaves);
}

function authPathFor(layers: Hex[][], index: number): Hex[] {
  const path: Hex[] = [];
  let i = index;
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level]!;
    const sibling = i % 2 === 0 ? (layer[i + 1] ?? layer[i]!) : layer[i - 1]!;
    path.push(sibling);
    i = Math.floor(i / 2);
  }
  return path;
}

function climbMerkleSync(leaf: Hex, index: number, authPath: Hex[]): Hex {
  let hash = leaf;
  let i = index;
  for (const sibling of authPath) {
    if (i % 2 === 0) {
      hash = sha512SyncHex(`ots-merkle|${hash}|${sibling}`);
    } else {
      hash = sha512SyncHex(`ots-merkle|${sibling}|${hash}`);
    }
    i = Math.floor(i / 2);
  }
  return hash;
}

async function climbMerkle(leaf: Hex, index: number, authPath: Hex[]): Promise<Hex> {
  return climbMerkleSync(leaf, index, authPath);
}

export async function generateLightKeypair(seed?: Uint8Array): Promise<LightKeypair> {
  const s = seed ?? randomBytes(32);
  const leafPublicKeys: Hex[] = [];
  let firstPairs: Hex[][] = [];

  // Sync leaf build — same digests as former await sha512Hex path, no serial microtasks.
  for (let i = 0; i < OTS_LEAF_COUNT; i++) {
    const leaf = leafMaterialSync(s, i);
    leafPublicKeys.push(leaf.leafPublicKey);
    if (i === 0) firstPairs = leaf.privatePairs;
  }

  const { root } = merkleRootFromLeavesSync(leafPublicKeys);
  const address = await addressFromPublicKey(root);
  return {
    scheme: "PIX-HASH-OTS-128",
    seed: bytesToHex(s),
    publicKey: root,
    address,
    nextLeaf: 0,
    leafCount: OTS_LEAF_COUNT,
    leafPublicKeys,
    privatePairs: firstPairs,
  };
}

/**
 * Sentinel for "the persisted cursor is missing or unreadable".
 *
 * Restoring with this fails closed: the window is treated as exhausted so
 * signing throws instead of silently reusing leaf 0 (PIX-11). Reconcile with
 * `advancePastUsedOtsLeaves` against observed on-chain usage, then restore
 * with the reconciled value.
 */
export const OTS_CURSOR_UNKNOWN = -1;

/**
 * Restore a keypair from seed and a persisted leaf cursor.
 *
 * `nextLeaf` is REQUIRED. It used to default to 0, so any caller that lost the
 * cursor — fresh tab, device restore, crash before persist — silently reused
 * spent leaves, which leaks Lamport halves at every differing digest bit.
 */
export async function restoreLightKeypair(
  seed: Uint8Array | Hex,
  nextLeaf: number,
): Promise<LightKeypair> {
  const bytes = typeof seed === "string" ? hexToBytes(seed) : seed;
  const kp = await generateLightKeypair(bytes);
  if (nextLeaf === OTS_CURSOR_UNKNOWN) {
    // Fail closed: reads and balances still work, signing refuses.
    kp.nextLeaf = kp.leafCount;
    return kp;
  }
  if (!Number.isInteger(nextLeaf) || nextLeaf < 0 || nextLeaf > kp.leafCount) {
    throw new Error(
      `restoreLightKeypair requires an explicit leaf cursor (got ${String(nextLeaf)}); use OTS_CURSOR_UNKNOWN to fail closed`,
    );
  }
  kp.nextLeaf = nextLeaf;
  if (nextLeaf < kp.leafCount) {
    const leaf = await leafMaterial(bytes, nextLeaf);
    kp.privatePairs = leaf.privatePairs;
  }
  return kp;
}

/** @deprecated Broken weak verifier removed — always returns false. Use verifyLightFull. */
export async function verifyLight(
  _message: string,
  _signatureJson: Hex,
  _publicKey: Hex,
): Promise<boolean> {
  // Previously this only checked pubCommit === publicKey and ignored message
  // binding — any signature by the key holder verified for any message.
  // Kept as a fail-closed stub so accidental imports cannot open the landmine.
  return false;
}

/**
 * Sign with the next unused OTS leaf. Mutates `keypair.nextLeaf`.
 * Throws if the Merkle window is exhausted.
 */
export async function signLightFull(message: string, keypair: LightKeypair): Promise<Hex> {
  if (keypair.scheme === "PIX-ML-DSA-65") {
    throw new Error("Use signPixel for PIX-ML-DSA-65 keypairs");
  }
  if (keypair.nextLeaf >= keypair.leafCount) {
    throw new Error(
      `OTS_EXHAUSTED: PIX-HASH-OTS-128 window (${keypair.leafCount} leaves) used up — rotate wallet`,
    );
  }

  const master = hexToBytes(keypair.seed);
  const leafIndex = keypair.nextLeaf;
  const { privatePairs, leafPublicKey } = leafMaterialSync(master, leafIndex);
  if (leafPublicKey !== keypair.leafPublicKeys[leafIndex]) {
    throw new Error("OTS leaf mismatch — corrupt key material");
  }

  const digest = sha512Sync(otsPayload(message));
  const bits = digest.slice(0, MSG_BITS / 8);
  const revealed: string[] = [];
  const complements: string[] = [];

  for (let i = 0; i < MSG_BITS; i++) {
    const byte = bits[Math.floor(i / 8)]!;
    const bit = (byte >> (7 - (i % 8))) & 1;
    const other = 1 - bit;
    revealed.push(privatePairs[i]![bit]!);
    complements.push(sha512SyncHex(hexToBytes(privatePairs[i]![other]!)).slice(0, 64));
  }

  const { layers } = merkleRootFromLeavesSync(keypair.leafPublicKeys);
  const authPath = authPathFor(layers, leafIndex);

  keypair.nextLeaf = leafIndex + 1;
  if (keypair.nextLeaf < keypair.leafCount) {
    const next = leafMaterialSync(master, keypair.nextLeaf);
    keypair.privatePairs = next.privatePairs;
  }

  return JSON.stringify({
    alg: "PIX-HASH-OTS-128",
    leafIndex,
    leafPublicKey,
    authPath,
    revealed,
    complements,
  });
}

export async function verifyLightFull(
  message: string,
  signatureJson: string,
  publicKey: Hex,
): Promise<boolean> {
  try {
    const sig = parseOtsSignatureJson(signatureJson);
    if (!sig) return false;

    // Reject the old forgeable format that only carried pubCommit.
    if (sig.pubCommit && !sig.complements) return false;

    const digest = sha512Sync(otsPayload(message));
    const bits = digest.slice(0, MSG_BITS / 8);
    const publicParts: string[] = [];

    for (let i = 0; i < MSG_BITS; i++) {
      const byte = bits[Math.floor(i / 8)]!;
      const bit = (byte >> (7 - (i % 8))) & 1;
      const revealedHash = sha512SyncHex(hexToBytes(sig.revealed[i]!)).slice(0, 64);
      const complement = sig.complements[i]!;
      if (bit === 0) {
        publicParts.push(`${revealedHash}${complement}`);
      } else {
        publicParts.push(`${complement}${revealedHash}`);
      }
    }

    // Bind index and path length exactly — indices congruent modulo the tree
    // width otherwise traverse an identical path (PIX-20).
    const expectedDepth = Math.log2(OTS_LEAF_COUNT);
    if (!Number.isInteger(sig.leafIndex) || sig.leafIndex < 0) return false;
    if (sig.leafIndex >= OTS_LEAF_COUNT) return false;
    if (sig.authPath.length !== expectedDepth) return false;
    if (sig.revealed.length !== MSG_BITS || sig.complements.length !== MSG_BITS) return false;

    const rebuiltLeaf = sha512SyncHex(publicParts.join("|"));
    if (rebuiltLeaf !== sig.leafPublicKey) return false;

    const root = climbMerkleSync(sig.leafPublicKey, sig.leafIndex, sig.authPath);
    return root === canonicalizeHex(publicKey);
  } catch {
    return false;
  }
}

/** True when the address is the commitment to this master public key. */
export async function publicKeyMatchesAddress(publicKey: Hex, address: string): Promise<boolean> {
  return (await addressFromPublicKey(publicKey)) === address;
}

/**
 * Extract OTS leaf index from a signature envelope.
 * Returns null for ML-DSA / non-OTS (no single-use leaf to track).
 */
export function parseOtsLeafIndex(signatureJson: string): number | null {
  try {
    if (signatureJson.length > MAX_SIGNATURE_JSON_BYTES) return null;
    const sig = parseOtsSignatureJson(signatureJson);
    if (sig) return sig.leafIndex;
    // ML-DSA / non-OTS — no leaf to track (size already gated; schema-soft parse).
    if (parseMldsaSignatureJson(signatureJson)) return null;
    return null;
  } catch {
    return null;
  }
}

/** Consensus key for one-time leaf tracking. */
export function otsUsageKey(publicKey: Hex, leafIndex: number): string {
  return `${publicKey}:${leafIndex}`;
}

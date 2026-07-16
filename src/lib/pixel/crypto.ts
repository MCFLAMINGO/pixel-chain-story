/**
 * Pixel Light Protocol — cryptographic primitives.
 *
 * Hash-based constructions are used so the chain is quantum-resistant today
 * without needing a new programming language. Production can swap the
 * SignatureScheme for NIST ML-DSA / SLH-DSA via liboqs while keeping the
 * same transaction and PoLS interfaces (crypto-agility).
 *
 * PIX-HASH-OTS-128 is a Merkle window of one-time Lamport keys. Each sign
 * consumes one leaf; reuse is rejected. This is required for the
 * quantum-resistance claim to mean anything.
 */

export type Hex = string;

const textEncoder = new TextEncoder();

/** Number of one-time leaves under each master key (power of two). */
export const OTS_LEAF_COUNT = 32;

export function bytesToHex(bytes: Uint8Array): Hex {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
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
  const digest = await crypto.subtle.digest("SHA-512", bytes);
  return new Uint8Array(digest);
}

export async function sha512Hex(data: Uint8Array | string): Promise<Hex> {
  return bytesToHex(await sha512(data));
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/** Deterministic address from a public key commitment (Merkle root). */
export async function addressFromPublicKey(publicKey: Hex): Promise<string> {
  const digest = await sha512Hex(`pix-addr|${publicKey}`);
  return `pix1${digest.slice(0, 38)}`;
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

const MSG_BITS = 128;
const CHUNK = 32;

async function hashChain(seed: Uint8Array, label: string): Promise<Uint8Array> {
  return sha512(concatBytes(seed, textEncoder.encode(label)));
}

async function deriveLeafSeed(master: Uint8Array, index: number): Promise<Uint8Array> {
  const digest = await sha512(concatBytes(master, textEncoder.encode(`ots-leaf|${index}`)));
  return digest.slice(0, 32);
}

async function leafMaterial(
  master: Uint8Array,
  index: number,
): Promise<{
  privatePairs: Hex[][];
  leafPublicKey: Hex;
}> {
  const s = await deriveLeafSeed(master, index);
  const privatePairs: Hex[][] = [];
  const publicParts: string[] = [];

  for (let i = 0; i < MSG_BITS; i++) {
    const zero = await hashChain(s, `sk|${i}|0`);
    const one = await hashChain(s, `sk|${i}|1`);
    privatePairs.push([bytesToHex(zero.slice(0, CHUNK)), bytesToHex(one.slice(0, CHUNK))]);
    const pz = await sha512Hex(zero.slice(0, CHUNK));
    const po = await sha512Hex(one.slice(0, CHUNK));
    publicParts.push(`${pz.slice(0, 16)}${po.slice(0, 16)}`);
  }

  const leafPublicKey = await sha512Hex(publicParts.join("|"));
  return { privatePairs, leafPublicKey };
}

async function merkleRootFromLeaves(leaves: Hex[]): Promise<{ root: Hex; layers: Hex[][] }> {
  if (leaves.length === 0) throw new Error("empty merkle");
  let layer = [...leaves];
  const layers: Hex[][] = [layer];
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? left;
      next.push(await sha512Hex(`ots-merkle|${left}|${right}`));
    }
    layer = next;
    layers.push(layer);
  }
  return { root: layer[0], layers };
}

function authPathFor(layers: Hex[][], index: number): Hex[] {
  const path: Hex[] = [];
  let i = index;
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const sibling = i % 2 === 0 ? (layer[i + 1] ?? layer[i]) : layer[i - 1];
    path.push(sibling);
    i = Math.floor(i / 2);
  }
  return path;
}

async function climbMerkle(leaf: Hex, index: number, authPath: Hex[]): Promise<Hex> {
  let hash = leaf;
  let i = index;
  for (const sibling of authPath) {
    if (i % 2 === 0) {
      hash = await sha512Hex(`ots-merkle|${hash}|${sibling}`);
    } else {
      hash = await sha512Hex(`ots-merkle|${sibling}|${hash}`);
    }
    i = Math.floor(i / 2);
  }
  return hash;
}

export async function generateLightKeypair(seed?: Uint8Array): Promise<LightKeypair> {
  const s = seed ?? randomBytes(32);
  const leafPublicKeys: Hex[] = [];
  let firstPairs: Hex[][] = [];

  for (let i = 0; i < OTS_LEAF_COUNT; i++) {
    const leaf = await leafMaterial(s, i);
    leafPublicKeys.push(leaf.leafPublicKey);
    if (i === 0) firstPairs = leaf.privatePairs;
  }

  const { root } = await merkleRootFromLeaves(leafPublicKeys);
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
 * Restore a keypair from seed and a persisted leaf cursor.
 * Always pass `nextLeaf` from wallet storage after prior signs.
 */
export async function restoreLightKeypair(
  seed: Uint8Array | Hex,
  nextLeaf = 0,
): Promise<LightKeypair> {
  const bytes = typeof seed === "string" ? hexToBytes(seed) : seed;
  const kp = await generateLightKeypair(bytes);
  if (nextLeaf < 0 || nextLeaf > kp.leafCount) {
    throw new Error(`Invalid nextLeaf ${nextLeaf}`);
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
  const { privatePairs, leafPublicKey } = await leafMaterial(master, leafIndex);
  if (leafPublicKey !== keypair.leafPublicKeys[leafIndex]) {
    throw new Error("OTS leaf mismatch — corrupt key material");
  }

  const digest = await sha512(message);
  const bits = digest.slice(0, MSG_BITS / 8);
  const revealed: string[] = [];
  const complements: string[] = [];

  for (let i = 0; i < MSG_BITS; i++) {
    const byte = bits[Math.floor(i / 8)];
    const bit = (byte >> (7 - (i % 8))) & 1;
    const other = 1 - bit;
    revealed.push(privatePairs[i][bit]);
    complements.push(await sha512Hex(hexToBytes(privatePairs[i][other])));
  }

  const { layers } = await merkleRootFromLeaves(keypair.leafPublicKeys);
  const authPath = authPathFor(layers, leafIndex);

  keypair.nextLeaf = leafIndex + 1;
  if (keypair.nextLeaf < keypair.leafCount) {
    const next = await leafMaterial(master, keypair.nextLeaf);
    keypair.privatePairs = next.privatePairs;
  }

  return JSON.stringify({
    alg: "PIX-HASH-OTS-128",
    leafIndex,
    leafPublicKey,
    authPath,
    revealed,
    complements: complements.map((c) => c.slice(0, 16)),
  });
}

export async function verifyLightFull(
  message: string,
  signatureJson: string,
  publicKey: Hex,
): Promise<boolean> {
  try {
    const sig = JSON.parse(signatureJson) as {
      alg: string;
      leafIndex?: number;
      leafPublicKey?: string;
      authPath?: string[];
      revealed: string[];
      complements: string[];
      /** Legacy weak envelope — rejected. */
      pubCommit?: string;
    };

    // Reject the old forgeable format that only carried pubCommit.
    if (sig.pubCommit && !sig.complements) return false;

    if (
      sig.alg !== "PIX-HASH-OTS-128" ||
      sig.revealed.length !== MSG_BITS ||
      sig.complements.length !== MSG_BITS ||
      typeof sig.leafIndex !== "number" ||
      !sig.leafPublicKey ||
      !Array.isArray(sig.authPath)
    ) {
      return false;
    }

    if (sig.leafIndex < 0 || sig.leafIndex >= OTS_LEAF_COUNT) return false;

    const digest = await sha512(message);
    const bits = digest.slice(0, MSG_BITS / 8);
    const publicParts: string[] = [];

    for (let i = 0; i < MSG_BITS; i++) {
      const byte = bits[Math.floor(i / 8)];
      const bit = (byte >> (7 - (i % 8))) & 1;
      const revealedHash = (await sha512Hex(hexToBytes(sig.revealed[i]))).slice(0, 16);
      const complement = sig.complements[i];
      if (bit === 0) {
        publicParts.push(`${revealedHash}${complement}`);
      } else {
        publicParts.push(`${complement}${revealedHash}`);
      }
    }

    const rebuiltLeaf = await sha512Hex(publicParts.join("|"));
    if (rebuiltLeaf !== sig.leafPublicKey) return false;

    const root = await climbMerkle(sig.leafPublicKey, sig.leafIndex, sig.authPath);
    return root === publicKey;
  } catch {
    return false;
  }
}

/** True when the address is the commitment to this master public key. */
export async function publicKeyMatchesAddress(publicKey: Hex, address: string): Promise<boolean> {
  return (await addressFromPublicKey(publicKey)) === address;
}

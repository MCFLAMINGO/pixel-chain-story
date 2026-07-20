/**
 * EVM twin of PIX-HASH-OTS-128 — keccak256 instead of SHA-512.
 *
 * Pixel-native ULAs stay on SHA-512 / ML-DSA (`bridge.ts`).
 * Ethereum verifies this twin so we never ship a stub `lightProofValid`.
 * Same shape: 128-bit Lamport + 32-leaf Merkle window.
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes, randomBytes, type Hex } from "./crypto";
import type { BridgeMessage, UniversalLightAttestation } from "./bridge";

export const EVM_OTS_LEAF_COUNT = 32;
export const EVM_OTS_MSG_BITS = 32;
export const EVM_OTS_ALG = "PIX-HASH-OTS-128-KECCAK" as const;

export interface EvmOtsKeypair {
  scheme: typeof EVM_OTS_ALG;
  seed: Hex;
  publicKey: Hex; // merkle root
  leafPublicKeys: Hex[];
  nextLeaf: number;
}

export interface EvmOtsSignature {
  alg: typeof EVM_OTS_ALG;
  leafIndex: number;
  leafPublicKey: Hex;
  authPath: Hex[];
  revealed: Hex[]; // 32-byte secrets
  complements: Hex[]; // 16-byte truncated hashes (32 hex chars)
}

function keccakHex(data: Uint8Array | string): Hex {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return bytesToHex(keccak_256(bytes));
}

/** Domain-separated merkle parent — binary, matches Solidity. */
export function evmMerkleNode(left: Hex, right: Hex): Hex {
  const out = new Uint8Array(65);
  out[0] = 0x01;
  out.set(hexToBytes(left.padStart(64, "0").slice(0, 64)), 1);
  out.set(hexToBytes(right.padStart(64, "0").slice(0, 64)), 33);
  return bytesToHex(keccak_256(out));
}

async function leafMaterial(
  master: Uint8Array,
  index: number,
): Promise<{ privatePairs: Hex[][]; leafPublicKey: Hex }> {
  const idx = new Uint8Array(4);
  new DataView(idx.buffer).setUint32(0, index, false);
  const leafSeed = keccak_256(new Uint8Array([...master, 0x02, ...idx]));
  const privatePairs: Hex[][] = [];
  const publicParts: string[] = [];

  for (let i = 0; i < EVM_OTS_MSG_BITS; i++) {
    const label0 = new Uint8Array([0x03, i & 0xff, 0]);
    const label1 = new Uint8Array([0x03, i & 0xff, 1]);
    const zero = keccak_256(new Uint8Array([...leafSeed, ...label0]));
    const one = keccak_256(new Uint8Array([...leafSeed, ...label1]));
    const zHex = bytesToHex(zero);
    const oHex = bytesToHex(one);
    privatePairs.push([zHex, oHex]);
    // 16-byte truncations → 32 hex chars each (matches Solidity bytes16)
    const pz = bytesToHex(keccak_256(zero)).slice(0, 32);
    const po = bytesToHex(keccak_256(one)).slice(0, 32);
    publicParts.push(`${pz}${po}`);
  }

  // leaf = keccak(0x04 || join(publicParts as utf8))
  const leafPublicKey = keccakHex(
    new Uint8Array([0x04, ...new TextEncoder().encode(publicParts.join("|"))]),
  );
  return { privatePairs, leafPublicKey };
}

function merkleRootFromLeaves(leaves: Hex[]): { root: Hex; layers: Hex[][] } {
  let layer = [...leaves];
  const layers: Hex[][] = [layer];
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] ?? left;
      next.push(evmMerkleNode(left, right));
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

function climbMerkle(leaf: Hex, index: number, authPath: Hex[]): Hex {
  let hash = leaf;
  let i = index;
  for (const sibling of authPath) {
    if (i % 2 === 0) hash = evmMerkleNode(hash, sibling);
    else hash = evmMerkleNode(sibling, hash);
    i = Math.floor(i / 2);
  }
  return hash;
}

export async function generateEvmOtsKeypair(seed?: Uint8Array): Promise<EvmOtsKeypair> {
  const s = seed ?? randomBytes(32);
  const leafPublicKeys: Hex[] = [];
  for (let i = 0; i < EVM_OTS_LEAF_COUNT; i++) {
    const leaf = await leafMaterial(s, i);
    leafPublicKeys.push(leaf.leafPublicKey);
  }
  const { root } = merkleRootFromLeaves(leafPublicKeys);
  return {
    scheme: EVM_OTS_ALG,
    seed: bytesToHex(s),
    publicKey: root,
    leafPublicKeys,
    nextLeaf: 0,
  };
}

/** Canonical UTF-8 message; on-chain: keccak256(bytes(message)). */
export function evmPolsMessage(params: {
  sequence: number;
  prevHash: Hex;
  beacon: Hex;
  sequencerRoot: Hex;
  messageHash: Hex;
}): string {
  return `ula-evm|${params.sequence}|${params.prevHash}|${params.beacon}|${params.sequencerRoot}|${params.messageHash}`;
}

export async function signEvmOts(
  message: string,
  keypair: EvmOtsKeypair,
): Promise<EvmOtsSignature> {
  if (keypair.nextLeaf >= EVM_OTS_LEAF_COUNT) {
    throw new Error("EVM OTS window exhausted");
  }
  const leafIndex = keypair.nextLeaf;
  const master = hexToBytes(keypair.seed);
  const { privatePairs, leafPublicKey } = await leafMaterial(master, leafIndex);
  if (leafPublicKey !== keypair.leafPublicKeys[leafIndex]) {
    throw new Error("EVM OTS leaf mismatch");
  }

  const digest = keccak_256(new TextEncoder().encode(message));
  const bits = digest.slice(0, EVM_OTS_MSG_BITS / 8);
  const revealed: Hex[] = [];
  const complements: Hex[] = [];

  for (let i = 0; i < EVM_OTS_MSG_BITS; i++) {
    const byte = bits[Math.floor(i / 8)];
    const bit = (byte >> (7 - (i % 8))) & 1;
    const other = 1 - bit;
    revealed.push(privatePairs[i][bit]);
    complements.push(bytesToHex(keccak_256(hexToBytes(privatePairs[i][other]))).slice(0, 32));
  }

  const { layers } = merkleRootFromLeaves(keypair.leafPublicKeys);
  const authPath = authPathFor(layers, leafIndex);
  keypair.nextLeaf = leafIndex + 1;

  return {
    alg: EVM_OTS_ALG,
    leafIndex,
    leafPublicKey,
    authPath,
    revealed,
    complements,
  };
}

export function verifyEvmOts(message: string, signature: EvmOtsSignature, publicKey: Hex): boolean {
  try {
    if (
      signature.alg !== EVM_OTS_ALG ||
      signature.revealed.length !== EVM_OTS_MSG_BITS ||
      signature.complements.length !== EVM_OTS_MSG_BITS
    ) {
      return false;
    }
    const digest = keccak_256(new TextEncoder().encode(message));
    const bits = digest.slice(0, EVM_OTS_MSG_BITS / 8);
    const publicParts: string[] = [];
    for (let i = 0; i < EVM_OTS_MSG_BITS; i++) {
      const byte = bits[Math.floor(i / 8)];
      const bit = (byte >> (7 - (i % 8))) & 1;
      const revealedHash = bytesToHex(keccak_256(hexToBytes(signature.revealed[i]))).slice(0, 32);
      const complement = signature.complements[i];
      if (bit === 0) publicParts.push(`${revealedHash}${complement}`);
      else publicParts.push(`${complement}${revealedHash}`);
    }
    const rebuiltLeaf = keccakHex(
      new Uint8Array([0x04, ...new TextEncoder().encode(publicParts.join("|"))]),
    );
    if (rebuiltLeaf !== signature.leafPublicKey) return false;
    return (
      climbMerkle(signature.leafPublicKey, signature.leafIndex, signature.authPath) === publicKey
    );
  } catch {
    return false;
  }
}

export interface EvmUlaPackage {
  version: 1;
  scheme: typeof EVM_OTS_ALG;
  sequence: number;
  prevHash: Hex;
  beacon: Hex;
  pixelHash: Hex;
  merkleRoot: Hex;
  pixelIndex: number;
  messageHash: Hex;
  sequencerRoot: Hex;
  message: BridgeMessage;
  signature: EvmOtsSignature;
}

/** Build a package Ethereum can verify (keccak OTS twin). */
export async function createEvmUlaPackage(params: {
  att: UniversalLightAttestation;
  evmKeypair: EvmOtsKeypair;
  beacon: Hex;
}): Promise<EvmUlaPackage> {
  const messageHash = params.att.messageHash;
  const msg = evmPolsMessage({
    sequence: params.att.lightProof.sequence,
    prevHash: params.att.prevHash,
    beacon: params.beacon,
    sequencerRoot: params.evmKeypair.publicKey,
    messageHash,
  });
  const signature = await signEvmOts(msg, params.evmKeypair);
  return {
    version: 1,
    scheme: EVM_OTS_ALG,
    sequence: params.att.lightProof.sequence,
    prevHash: params.att.prevHash,
    beacon: params.beacon,
    pixelHash: params.att.pixelHash,
    merkleRoot: params.att.merkleRoot,
    pixelIndex: params.att.pixelIndex,
    messageHash,
    sequencerRoot: params.evmKeypair.publicKey,
    message: params.att.message,
    signature,
  };
}

export function verifyEvmUlaPackage(pkg: EvmUlaPackage): { ok: boolean; reason?: string } {
  if (pkg.version !== 1 || pkg.scheme !== EVM_OTS_ALG) {
    return { ok: false, reason: "bad envelope" };
  }
  const msg = evmPolsMessage({
    sequence: pkg.sequence,
    prevHash: pkg.prevHash,
    beacon: pkg.beacon,
    sequencerRoot: pkg.sequencerRoot,
    messageHash: pkg.messageHash,
  });
  if (!verifyEvmOts(msg, pkg.signature, pkg.sequencerRoot)) {
    return { ok: false, reason: "ots sig failed" };
  }
  return { ok: true };
}

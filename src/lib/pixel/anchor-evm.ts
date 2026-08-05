/**
 * EVM anchoring venue — publish a Pixel tip digest to any EVM chain.
 *
 * Makes the `AnchorVenue` interface real. `anchor.ts` shipped with only an
 * in-memory venue, so "adding a venue is a four-field interface" was a claim
 * without an instance.
 *
 * Two deliberate properties:
 *
 * 1. READS NEED NO KEYS. `fetch` and `verifyOnChain` use `eth_call`, so anyone
 *    can check an anchor against any RPC without an account. Verification is
 *    the part strangers must be able to do.
 * 2. WRITES TAKE AN INJECTED SENDER. This repo has no secp256k1 dependency, and
 *    adding one to sign transactions would put a new crypto library on the
 *    critical path of a project that just spent a day removing hand-rolled
 *    crypto. Callers supply their own signer; `castSender` wires up Foundry,
 *    which CI already installs.
 *
 * No custody anywhere. A venue holds a 32-byte digest and a timestamp.
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, canonicalizeHex, hexToBytes, type Hex } from "./crypto";
import {
  anchorDigest,
  PIXEL_DIGEST_BYTES,
  type AnchorVenue,
  type AnchorVenueKind,
  type PixelAnchorRecord,
  type PublishedAnchor,
} from "./anchor";

/** Returns a transaction hash. Supplied by the caller — see `castSender`. */
export type EvmSender = (tx: { to: string; data: Hex }) => Promise<string>;

export interface EvmVenueConfig {
  id: string;
  chainId: number;
  rpcUrl: string;
  /** Deployed PixelAnchor address. */
  contract: string;
  /** Required only to publish; reads work without it. */
  sender?: EvmSender;
  explorerTxUrl?: (txHash: string) => string;
  /** Operational honesty: who can reorder or censor here. */
  sequencer?: "decentralized" | "centralized" | "unknown";
  note?: string;
}

// ── minimal ABI codec ────────────────────────────────────────────────────────
// Hand-rolled rather than pulling in a web3 library for four call shapes.

function selector(signature: string): Uint8Array {
  return keccak_256(new TextEncoder().encode(signature)).slice(0, 4);
}

function word(value: bigint | number): Uint8Array {
  const out = new Uint8Array(32);
  let v = BigInt(value);
  if (v < 0n) throw new Error("abi: negative value");
  for (let i = 31; i >= 0 && v > 0n; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function addressWord(addr: string): Uint8Array {
  const clean = canonicalizeHex(addr);
  if (clean.length !== 40) throw new Error(`abi: bad address ${addr}`);
  const out = new Uint8Array(32);
  out.set(hexToBytes(clean), 12);
  return out;
}

/** Encode `bytes` as a length word plus 32-byte-padded data. */
function dynamicBytes(hex: Hex): Uint8Array {
  const data = hexToBytes(canonicalizeHex(hex));
  const padded = Math.ceil(data.length / 32) * 32;
  const out = new Uint8Array(32 + padded);
  out.set(word(data.length), 0);
  out.set(data, 32);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** `anchor(uint64,uint64,bytes,bytes)` calldata. */
export function encodeAnchorCall(record: PixelAnchorRecord): Hex {
  const tip = dynamicBytes(record.tipHash);
  const spatial = dynamicBytes(record.spatialRoot);
  const headWords = 4;
  const tipOffset = headWords * 32;
  const spatialOffset = tipOffset + tip.length;
  return `0x${bytesToHex(
    concat([
      selector("anchor(uint64,uint64,bytes,bytes)"),
      word(record.networkId),
      word(record.pixelIndex),
      word(tipOffset),
      word(spatialOffset),
      tip,
      spatial,
    ]),
  )}`;
}

/** `anchorAt(uint64,uint64)` calldata. */
export function encodeAnchorAtCall(networkId: number, pixelIndex: number): Hex {
  return `0x${bytesToHex(
    concat([selector("anchorAt(uint64,uint64)"), word(networkId), word(pixelIndex)]),
  )}`;
}

/** `matches(uint64,uint64,bytes,bytes)` calldata. */
export function encodeMatchesCall(record: PixelAnchorRecord): Hex {
  const call = encodeAnchorCall(record);
  const rest = call.slice(2 + 8); // drop 0x + old selector
  return `0x${bytesToHex(selector("matches(uint64,uint64,bytes,bytes)"))}${rest}`;
}

export interface DecodedAnchor {
  digest: Hex;
  anchoredAtSec: number;
  anchorer: string;
  /** True when nothing has been anchored at that height. */
  empty: boolean;
}

/** Decode the `Anchor` struct: (bytes32 digest, uint64 anchoredAt, address anchorer). */
export function decodeAnchorAt(returnData: string): DecodedAnchor {
  const hex = canonicalizeHex(returnData);
  if (hex.length < 192) throw new Error(`abi: short anchorAt return (${hex.length} hex chars)`);
  const digest = hex.slice(0, 64);
  const anchoredAtSec = Number(BigInt(`0x${hex.slice(64, 128)}`));
  const anchorer = `0x${hex.slice(128 + 24, 192)}`;
  return { digest, anchoredAtSec, anchorer, empty: anchoredAtSec === 0 };
}

export function decodeBool(returnData: string): boolean {
  return BigInt(`0x${canonicalizeHex(returnData)}`) !== 0n;
}

// ── JSON-RPC ─────────────────────────────────────────────────────────────────

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? "rpc error"}`);
  if (body.result === undefined) throw new Error(`${method}: empty result`);
  return body.result;
}

/** Guard against pointing a venue at the wrong network. */
export async function assertChainId(rpcUrl: string, expected: number): Promise<void> {
  const raw = await rpc<string>(rpcUrl, "eth_chainId", []);
  const actual = Number(BigInt(raw));
  if (actual !== expected) {
    throw new Error(`chain id mismatch at ${rpcUrl}: expected ${expected}, RPC reports ${actual}`);
  }
}

/** Read an anchor. No keys, no signer — this is what strangers do. */
export async function readAnchor(
  config: EvmVenueConfig,
  networkId: number,
  pixelIndex: number,
): Promise<DecodedAnchor> {
  const data = await rpc<string>(config.rpcUrl, "eth_call", [
    { to: config.contract, data: encodeAnchorAtCall(networkId, pixelIndex) },
    "latest",
  ]);
  return decodeAnchorAt(data);
}

/** Ask the chain whether this exact record is what was published. */
export async function verifyOnChain(
  config: EvmVenueConfig,
  record: PixelAnchorRecord,
): Promise<boolean> {
  const data = await rpc<string>(config.rpcUrl, "eth_call", [
    { to: config.contract, data: encodeMatchesCall(record) },
    "latest",
  ]);
  return decodeBool(data);
}

export function evmAnchorVenue(config: EvmVenueConfig): AnchorVenue {
  const kind: AnchorVenueKind = "evm";
  return {
    id: config.id,
    kind,
    publish: async (record) => {
      if (!config.sender) {
        throw new Error(`${config.id}: no sender configured — this venue is read-only`);
      }
      await assertChainId(config.rpcUrl, config.chainId);
      const txHash = await config.sender({
        to: config.contract,
        data: encodeAnchorCall(record),
      });
      const published: PublishedAnchor = {
        ...record,
        venueId: config.id,
        venueKind: kind,
        digest: anchorDigest(record),
        anchoredAtMs: Date.now(),
        reference: config.explorerTxUrl ? config.explorerTxUrl(txHash) : txHash,
      };
      return published;
    },
    fetch: async (networkId, pixelIndex) => {
      const onChain = await readAnchor(config, networkId, pixelIndex);
      if (onChain.empty) return null;
      // The chain stores a digest, not the preimage; the caller supplies the
      // record it believes and `verifyOnChain` decides. Reconstructing a record
      // from a digest is impossible by design.
      return {
        networkId,
        pixelIndex,
        tipHash: "".padEnd(PIXEL_DIGEST_BYTES * 2, "0"),
        spatialRoot: "".padEnd(PIXEL_DIGEST_BYTES * 2, "0"),
        venueId: config.id,
        venueKind: kind,
        digest: onChain.digest,
        anchoredAtMs: onChain.anchoredAtSec * 1000,
        reference: `${config.contract}#${pixelIndex}`,
      };
    },
  };
}

/**
 * Shell out to Foundry's `cast send`.
 *
 * Keeps transaction signing out of this repo. CI already installs Foundry.
 */
export function castSender(opts: {
  rpcUrl: string;
  privateKey: string;
  castPath?: string;
}): EvmSender {
  return async ({ to, data }) => {
    const { spawnSync } = await import("node:child_process");
    const cast = opts.castPath ?? "cast";
    const r = spawnSync(
      cast,
      ["send", to, "--data", data, "--rpc-url", opts.rpcUrl, "--private-key", opts.privateKey],
      { encoding: "utf8" },
    );
    if (r.status !== 0) throw new Error(`cast send failed: ${r.stderr || r.stdout}`);
    const m = (r.stdout || "").match(/transactionHash\s+(0x[a-fA-F0-9]{64})/);
    return m?.[1] ?? (r.stdout || "").trim();
  };
}

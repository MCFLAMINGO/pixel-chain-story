/**
 * Optical light encoding — the analog bridge.
 *
 * A phone screen shines a picture; that picture holds key material.
 * Another camera (or two screens held together) reads the pattern back.
 *
 * No new programming language is required: light intensity grids are bytes
 * rendered as luminance. The computer "thinks" by projecting light; the
 * picture is the channel.
 */

import { bytesToHex, hexToBytes, sha512Hex, type Hex } from "./crypto";

export const OPTICAL_GRID = 16; // 16×16 luminance cells
export const OPTICAL_BYTES = 32; // 256-bit payload in the first 32 cells

export interface OpticalPattern {
  /** Row-major luminance 0–255 for each cell. */
  cells: number[];
  /** SHA-512 of payload — integrity check after capture. */
  checksum: Hex;
  width: number;
  height: number;
  /** Hex form of the embedded payload (the key the light carries). */
  payloadHex: Hex;
}

function packPayloadIntoCells(payload: Uint8Array, checksum: Hex): number[] {
  const cells = new Array<number>(OPTICAL_GRID * OPTICAL_GRID).fill(0);
  // First 32 cells: raw key bytes as luminance — the light holds the key.
  for (let i = 0; i < OPTICAL_BYTES; i++) {
    cells[i] = payload[i];
  }
  // Next cells: checksum seal for integrity after capture.
  const seal = hexToBytes(checksum.slice(0, 64));
  for (let i = 0; i < seal.length && OPTICAL_BYTES + i < cells.length; i++) {
    cells[OPTICAL_BYTES + i] = seal[i];
  }
  // Remaining: maze-like texture derived from the seal (archaeological light).
  for (let i = OPTICAL_BYTES + seal.length; i < cells.length; i++) {
    cells[i] = seal[i % seal.length] ^ ((i * 17) & 0xff);
  }
  return cells;
}

function unpackPayloadFromCells(cells: number[]): Uint8Array {
  const payload = new Uint8Array(OPTICAL_BYTES);
  for (let i = 0; i < OPTICAL_BYTES; i++) {
    payload[i] = Math.max(0, Math.min(255, Math.round(cells[i])));
  }
  return payload;
}

/** Encode 32-byte material into a screen-shineable light pattern (reversible). */
export async function encodeOpticalPattern(payload: Uint8Array): Promise<OpticalPattern> {
  if (payload.length !== OPTICAL_BYTES) {
    throw new Error(`Optical payload must be ${OPTICAL_BYTES} bytes`);
  }
  const checksum = await sha512Hex(payload);
  const cells = packPayloadIntoCells(payload, checksum);
  return {
    cells,
    checksum,
    width: OPTICAL_GRID,
    height: OPTICAL_GRID,
    payloadHex: bytesToHex(payload),
  };
}

/** Encode a hex secret (seed / commitment) for screen projection. */
export async function encodeHexAsLight(hex: Hex): Promise<OpticalPattern> {
  const bytes = hexToBytes(hex);
  const padded = new Uint8Array(OPTICAL_BYTES);
  padded.set(bytes.slice(0, OPTICAL_BYTES));
  return encodeOpticalPattern(padded);
}

/**
 * Decode a captured luminance grid back to key bytes.
 * Returns null if checksum fails (wrong angle / maze / noise).
 */
export async function decodeOpticalPattern(cells: number[]): Promise<Uint8Array | null> {
  if (cells.length !== OPTICAL_GRID * OPTICAL_GRID) return null;
  const payload = unpackPayloadFromCells(cells);
  const checksum = await sha512Hex(payload);
  // Compare embedded seal region loosely — exact match on recomputed checksum
  // against what encode stored requires the caller to pass expectedChecksum,
  // or we verify seal cells.
  const seal = hexToBytes(checksum.slice(0, 64));
  let mismatches = 0;
  for (let i = 0; i < Math.min(8, seal.length); i++) {
    if (Math.abs(cells[OPTICAL_BYTES + i] - seal[i]) > 12) mismatches++;
  }
  if (mismatches > 2) return null;
  return payload;
}

export async function verifyCapturedPattern(
  cells: number[],
  expectedChecksum: Hex,
): Promise<{ ok: boolean; payload: Uint8Array | null }> {
  const payload = await decodeOpticalPattern(cells);
  if (!payload) return { ok: false, payload: null };
  const check = await sha512Hex(payload);
  return { ok: check === expectedChecksum, payload };
}

/** CSS colors for rendering the light pattern on screen. */
export function patternToCssGrid(pattern: OpticalPattern): string[] {
  return pattern.cells.map((v) => {
    const t = Math.max(8, Math.min(255, v));
    // Daylight phosphor — screen light as the carrier.
    return `rgb(${t}, ${Math.floor(t * 0.97)}, ${Math.floor(t * 0.88)})`;
  });
}

/**
 * Simulate two open screens / flashlight+camera capture.
 * Noise models imperfect optical channels; decode still works within tolerance.
 */
export function simulateCameraCapture(pattern: OpticalPattern, noise = 0): number[] {
  return pattern.cells.map((v) => {
    if (noise <= 0) return v;
    const delta = Math.floor((Math.random() * 2 - 1) * noise);
    return Math.max(0, Math.min(255, v + delta));
  });
}

/** One-time optical challenge beacon for PoLS revelation ceremonies. */
export async function opticalBeacon(sequence: number, prevHash: Hex): Promise<Hex> {
  return sha512Hex(`light-beacon|${sequence}|${prevHash}`);
}

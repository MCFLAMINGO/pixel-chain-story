/**
 * Pay-face optical matrix — Kindling address rail for /wallet.
 *
 * Logical layer: PXP1 magic + 19-byte pix1… body in a 32-byte payload.
 * Physical transport (default): PXP1-P — one bit per cell (full-on / full-off).
 * Amplitude-per-byte paint is not projectable on RGB565 (≈5-bit red).
 * Never the vault seed.
 */

import { bytesToHex, hexToBytes, isPixelAddress, sha512Hex, type Hex } from "./crypto";
import { OPTICAL_BYTES, OPTICAL_GRID, type OpticalPattern } from "./optical";
import { patternToRaster, type OpticalCaptureResult, type PixelRaster } from "./optical-capture";

/** Magic "PXP1" — Pixel pay-face v1 (not vault / not Kindling commitment). */
export const PAY_FACE_OPTICAL_MAGIC = new Uint8Array([0x50, 0x58, 0x50, 0x31]);

/** Transport id — same magic/layout; binary cells for physical projection. */
export const PAY_FACE_TRANSPORT = "PXP1-P" as const;

export const PAY_FACE_ON = 255;
export const PAY_FACE_OFF = 0;

export function packPayFacePayload(address: string): Uint8Array {
  const addr = address.trim().toLowerCase();
  if (!isPixelAddress(addr)) throw new Error("pay face must be pix1…");
  const body = hexToBytes(addr.slice(4) as Hex); // 19 bytes
  if (body.length !== 19) throw new Error("pay face body length");
  const out = new Uint8Array(OPTICAL_BYTES);
  out.set(PAY_FACE_OPTICAL_MAGIC, 0);
  out.set(body, PAY_FACE_OPTICAL_MAGIC.length);
  return out;
}

export function unpackPayFacePayload(payload: Uint8Array): string | null {
  if (payload.length !== OPTICAL_BYTES) return null;
  for (let i = 0; i < PAY_FACE_OPTICAL_MAGIC.length; i++) {
    if (payload[i] !== PAY_FACE_OPTICAL_MAGIC[i]) return null;
  }
  const body = payload.slice(PAY_FACE_OPTICAL_MAGIC.length, PAY_FACE_OPTICAL_MAGIC.length + 19);
  const hex = [...body].map((b) => b.toString(16).padStart(2, "0")).join("");
  const addr = `pix1${hex}`;
  return isPixelAddress(addr) ? addr : null;
}

/** Pack 32 payload bytes → 256 binary cells (MSB-first within each byte, row-major). */
export function payloadToBinaryCells(payload: Uint8Array): number[] {
  if (payload.length !== OPTICAL_BYTES) throw new Error("pay face payload length");
  const n = OPTICAL_GRID * OPTICAL_GRID;
  const cells = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const byte = payload[i >> 3]!;
    const bit = 7 - (i & 7);
    cells[i] = (byte >> bit) & 1 ? PAY_FACE_ON : PAY_FACE_OFF;
  }
  return cells;
}

/**
 * Threshold cells against the midpoint of the captured range.
 * Exposure, white-balance, wall cast, and falloff cancel when both levels move together.
 */
export function binaryCellsToPayload(cells: number[]): Uint8Array | null {
  if (cells.length !== OPTICAL_GRID * OPTICAL_GRID) return null;
  let min = 255;
  let max = 0;
  for (const c of cells) {
    const v = Math.max(0, Math.min(255, c));
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Need separable ON/OFF; flat frame = no matrix.
  if (max - min < 24) return null;
  const mid = (min + max) / 2;
  const payload = new Uint8Array(OPTICAL_BYTES);
  for (let i = 0; i < cells.length; i++) {
    const bit = (cells[i] ?? 0) > mid ? 1 : 0;
    payload[i >> 3]! |= bit << (7 - (i & 7));
  }
  return payload;
}

/** Contrast score for reader heat — binary matrices look high-contrast. */
export function binaryMatrixScore(cells: number[]): number {
  if (cells.length !== OPTICAL_GRID * OPTICAL_GRID) return 0;
  let min = 255;
  let max = 0;
  let on = 0;
  let off = 0;
  for (const c of cells) {
    const v = Math.max(0, Math.min(255, c));
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  if (span < 24) return 0;
  const mid = (min + max) / 2;
  for (const c of cells) {
    if (c > mid) on++;
    else off++;
  }
  // Healthy bit mix (not all-white / all-black crop).
  const balance = Math.min(on, off) / (cells.length / 2);
  return Math.min(0.85, 0.35 + (span / 255) * 0.35 + balance * 0.25);
}

export async function encodePayFaceMatrix(address: string): Promise<OpticalPattern> {
  const payload = packPayFacePayload(address);
  const cells = payloadToBinaryCells(payload);
  const checksum = await sha512Hex(payload);
  return {
    cells,
    checksum,
    width: OPTICAL_GRID,
    height: OPTICAL_GRID,
    payloadHex: bytesToHex(payload),
  };
}

export async function decodePayFaceMatrix(cells: number[]): Promise<string | null> {
  const payload = binaryCellsToPayload(cells);
  if (!payload) return null;
  return unpackPayFacePayload(payload);
}

/** Decode a physical camera/raster capture into pix1… */
export async function decodePayFaceCapture(
  capture: OpticalCaptureResult,
): Promise<{ address: string; physical: boolean } | null> {
  const address = await decodePayFaceMatrix(capture.cells);
  if (!address) return null;
  const physical = capture.source === "getUserMedia" || capture.source === "imageData";
  return { address, physical };
}

export function payFaceOpticalThesis(): string {
  return (
    "Kindling matrix: your pay face as light (PXP1-P binary cells) — friend points a camera, To fills. " +
    "Vault never projected. QR still works when the room is dark."
  );
}

/**
 * Raster with a bright quiet zone (registration / crop aid).
 * Marks and the quiet ring live outside the 16×16 — never inside payload cells.
 * White ring lets the camera find the square when OFF cells are pure black.
 */
export function payFaceRasterWithQuietZone(
  pattern: OpticalPattern,
  scale = 12,
  quietCells = 1,
): PixelRaster {
  const inner = patternToRaster(pattern, scale);
  const q = Math.max(1, quietCells * scale);
  const width = inner.width + 2 * q;
  const height = inner.height + 2 * q;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  for (let y = 0; y < inner.height; y++) {
    for (let x = 0; x < inner.width; x++) {
      const si = (y * inner.width + x) * 4;
      const di = ((y + q) * width + (x + q)) * 4;
      data[di] = inner.data[si]!;
      data[di + 1] = inner.data[si + 1]!;
      data[di + 2] = inner.data[si + 2]!;
      data[di + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Quiet-zone fraction for a 1-cell ring around a 16×16 (1/18). */
export const PAY_FACE_QUIET_INSET = 1 / (OPTICAL_GRID + 2);

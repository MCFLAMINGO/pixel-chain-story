/**
 * Pay-face optical matrix — Kindling address rail for /wallet.
 *
 * Encodes public pix1… into a 16×16 luminance grid. Never the vault seed.
 * Friend scans with camera → To fills → Send. Presence = live capture.
 */

import { hexToBytes, isPixelAddress, type Hex } from "./crypto";
import {
  decodeOpticalPattern,
  encodeOpticalPattern,
  OPTICAL_BYTES,
  type OpticalPattern,
} from "./optical";
import type { OpticalCaptureResult } from "./optical-capture";

/** Magic "PXP1" — Pixel pay-face v1 (not vault / not Kindling commitment). */
export const PAY_FACE_OPTICAL_MAGIC = new Uint8Array([0x50, 0x58, 0x50, 0x31]);

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

export async function encodePayFaceMatrix(address: string): Promise<OpticalPattern> {
  return encodeOpticalPattern(packPayFacePayload(address));
}

export async function decodePayFaceMatrix(cells: number[]): Promise<string | null> {
  const payload = await decodeOpticalPattern(cells);
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
    "Kindling matrix: your pay face as light — friend points a camera, To fills. " +
    "Vault never projected. QR still works when the room is dark."
  );
}

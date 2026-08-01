/**
 * Optical pay-face profile — discoverable JSON + typed constants.
 * SPA renderers hardcode PXP1 / transport PXP1-P; fetch /optical-profile.json when available.
 * Tip RPC is not required to paint or scan.
 */

import { OPTICAL_BYTES, OPTICAL_GRID } from "./optical";
import { PAY_FACE_OPTICAL_MAGIC, PAY_FACE_TRANSPORT } from "./pay-face-optical";

export const OPTICAL_PROFILE_URL = "/optical-profile.json";
export const OPTICAL_PROFILE_WELL_KNOWN_URL = "/.well-known/optical-profile.json";

export type OpticalPayFaceProfile = {
  id: "PXP1";
  magic: number[];
  magicAscii: "PXP1";
  grid: number;
  cells: number;
  payloadBytes: number;
  kind: "pay_face";
  vault: false;
  address: { prefix: "pix1"; bodyBytes: 19; bodyOffset: 4 };
  /** Logical byte layout — unchanged by transport. */
  layout: {
    magicBytes: [number, number];
    addressBytes: [number, number];
    reservedBytes: [number, number];
  };
  transports: OpticalTransport[];
  unknownMagic: "ignore_or_upgrade";
  registration: {
    marks: "quiet_zone_only";
    rule: string;
  };
  envelope: {
    note: string;
    nHDCellPx: number;
    binaryExactBlurPx: number;
    binaryFailBlurPx: number;
  };
};

export type OpticalTransport = {
  id: "PXP1-P" | "PXP1-A";
  default?: boolean;
  paint: "binary" | "amplitude_byte";
  projectable: boolean;
  rule: string;
  decode: string;
};

export type OpticalProfileDocument = {
  name: string;
  profileVersion: number;
  thesis: string;
  profiles: OpticalPayFaceProfile[];
  discovery: {
    profileUrl: string;
    wellKnownUrl: string;
    walletUrl: string;
    tipRpc: string;
    docUrl: string;
  };
};

/** Canonical PXP1 — must stay in lockstep with public/optical-profile.json */
export function pxp1Profile(): OpticalPayFaceProfile {
  return {
    id: "PXP1",
    magic: [...PAY_FACE_OPTICAL_MAGIC],
    magicAscii: "PXP1",
    grid: OPTICAL_GRID,
    cells: OPTICAL_GRID * OPTICAL_GRID,
    payloadBytes: OPTICAL_BYTES,
    kind: "pay_face",
    vault: false,
    address: { prefix: "pix1", bodyBytes: 19, bodyOffset: 4 },
    layout: {
      magicBytes: [0, 3],
      addressBytes: [4, 22],
      reservedBytes: [23, 31],
    },
    transports: [
      {
        id: PAY_FACE_TRANSPORT,
        default: true,
        paint: "binary",
        projectable: true,
        rule: "One bit per cell, MSB-first within each payload byte, row-major. ON=255 OFF=0. Same magic and 32-byte layout as PXP1 — transport only.",
        decode:
          "Threshold each cell against the midpoint of the captured min/max range (exposure / white-balance / wall cast / falloff cancel).",
      },
      {
        id: "PXP1-A",
        default: false,
        paint: "amplitude_byte",
        projectable: false,
        rule: "Lab/historical: cell luminance ≈ payload byte. Not projectable on RGB565 (5-bit red ≈ 22 distinct levels) — amplitude recovers ~0–3% of bytes on measured projector links.",
        decode: "Do not use for physical projection. Prefer PXP1-P.",
      },
    ],
    unknownMagic: "ignore_or_upgrade",
    registration: {
      marks: "quiet_zone_only",
      rule: "Finder / registration marks must live in the quiet zone outside the 16×16 grid. All 256 cells carry payload bits under PXP1-P — there are no spare cells to borrow. Default: white quiet ring (~1 cell, inset 1/18) so black OFF cells do not collapse the crop into the letterbox.",
    },
    envelope: {
      note: "Honest blur envelope at nHD (~18px cells): binary stays exact to ~5px blur; bits lose past ~7px (~0.4 cell). The image looks visibly soft to a human before decode fails.",
      nHDCellPx: 18,
      binaryExactBlurPx: 5,
      binaryFailBlurPx: 7,
    },
  };
}

export function opticalProfileDocument(): OpticalProfileDocument {
  return {
    name: "Pixel optical pay-face",
    profileVersion: 1,
    thesis:
      "Light is the API — no tip RPC required to render or scan a pay face. Vault never projected. Physical paint is PXP1-P (binary cells).",
    profiles: [pxp1Profile()],
    discovery: {
      profileUrl: OPTICAL_PROFILE_URL,
      wellKnownUrl: OPTICAL_PROFILE_WELL_KNOWN_URL,
      walletUrl: "/wallet",
      tipRpc: "optional — encode/decode works offline from pix1…",
      docUrl: "docs/optical-profile.md",
    },
  };
}

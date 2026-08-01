/**
 * Optical pay-face profile — discoverable JSON + typed constants.
 * SPA renderers hardcode PXP1; fetch /optical-profile.json when available.
 * Tip RPC is not required to paint or scan.
 */

import { OPTICAL_BYTES, OPTICAL_GRID } from "./optical";
import { PAY_FACE_OPTICAL_MAGIC } from "./pay-face-optical";

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
  channel: { carrier: "red"; rule: string };
  layout: {
    payloadCells: [number, number];
    sealCells: [number, number];
    textureCells: [number, number];
  };
  unknownMagic: "ignore_or_upgrade";
};

export type OpticalProfileDocument = {
  name: string;
  profileVersion: number;
  thesis: string;
  profiles: OpticalPayFaceProfile[];
  discovery: {
    profileUrl: string;
    walletUrl: string;
    tipRpc: string;
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
    channel: {
      carrier: "red",
      rule: "Cell red channel must stay ≈ payload byte; glow/bloom is CSS only — never remap cell RGB for style.",
    },
    layout: {
      payloadCells: [0, OPTICAL_BYTES - 1],
      sealCells: [OPTICAL_BYTES, OPTICAL_BYTES + 31],
      textureCells: [OPTICAL_BYTES + 32, OPTICAL_GRID * OPTICAL_GRID - 1],
    },
    unknownMagic: "ignore_or_upgrade",
  };
}

export function opticalProfileDocument(): OpticalProfileDocument {
  return {
    name: "Pixel optical pay-face",
    profileVersion: 1,
    thesis:
      "Light is the API — no tip RPC required to render or scan a pay face. Vault never projected.",
    profiles: [pxp1Profile()],
    discovery: {
      profileUrl: OPTICAL_PROFILE_URL,
      walletUrl: "/wallet",
      tipRpc: "optional — encode/decode works offline from pix1…",
    },
  };
}

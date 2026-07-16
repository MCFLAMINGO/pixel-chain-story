/**
 * Lumen — a light-native coding structure.
 *
 * Rust is excellent for systems. Lumen is better for *this* domain because its
 * primitives match the physics Pixel runs on:
 *
 *   ghost      value that is both until observed
 *   shine      emit light (screen / sequence / proof)
 *   aperture   the opening that lets light through (revelation gate)
 *   collapse   measurement — one truth remains
 *   maze       optical pattern that hides / carries a key
 *   paint      write a pixel into the living ledger picture
 *   veil       privacy — light reaches only chosen eyes
 *
 * Programs read like ceremonies of light, not memory layouts.
 */

export type LumenValue =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "address"; value: string }
  | { kind: "ghost"; id: string; payload: Record<string, unknown> }
  | { kind: "picture"; cells: number[]; checksum: string; payloadHex: string }
  | { kind: "settled"; txid: string; summary: string }
  | { kind: "unit" };

export type Expr =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "ident"; name: string }
  | { type: "call"; name: string; args: Expr[] };

export type Stmt =
  | { type: "let"; name: string; expr: Expr }
  | { type: "ghost"; name: string; expr: Expr }
  | { type: "shine"; target: Expr; via?: string }
  | { type: "collapse"; name: string }
  | { type: "veil"; name: string; level: "public" | "private" | "selective" }
  | { type: "paint"; expr: Expr }
  | { type: "return"; expr: Expr }
  | { type: "when_light"; body: Stmt[] };

export interface Ray {
  name: string;
  params: string[];
  body: Stmt[];
}

export interface LumenModule {
  name: string;
  rays: Ray[];
}

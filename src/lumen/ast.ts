/**
 * Lumen — a light-native coding structure.
 *
 * Guided by science it need not name (`One.Creed.guide`): every verb below
 * must bind a real invariant in the host — never simile alone.
 *
 * Rust is excellent for systems. Lumen aims for the same *class* of power for
 * light: ownership of ghosts, match on kinds, ensure/refuse, aperture gates,
 * and ray composition — primitives that match Pixel physics, not memory layouts.
 *
 *   ghost      value that is both until observed (owned — collapse consumes)
 *   shine      emit light (screen / sequence / proof)
 *   aperture   revelation gate — body runs only when condition holds
 *   collapse   measurement — one truth remains; ghost is consumed
 *   match      branch on light kind (settled / ghost / tip / proof / …)
 *   ensure     Result-like precondition (refuse with light vocabulary)
 *   maze       optical pattern that hides / carries a key
 *   paint      write a pixel into the living ledger picture
 *   veil       privacy — light reaches only chosen eyes
 *   digest     one labeled light hash (hides sha512 domain soup)
 *   attest     existence proof — store of creation, not only wealth
 *   tip        sense living tip (waveDigest / spatialRoot)
 *   kindle     Presence Seal → self-custody settle
 *   shine_in   Worldlight $ → PIX on Personal Source
 *   balance    UTXO holdings for a host wallet
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
  /** Living tip sense — wave + spatial roots from the host chain tip. */
  | {
      kind: "tip";
      index: number;
      tipHash: string;
      waveDigest: string;
      spatialRoot: string;
    }
  /** Recomputable existence receipt — light that survives elsewhere. */
  | {
      kind: "proof";
      light: string;
      subject: string;
      label: string;
      at: number;
    }
  | { kind: "unit" };

export type BinOp = "+" | "-" | "*" | "/" | ">" | "<" | ">=" | "<=" | "==" | "!=";

export type Expr =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "ident"; name: string }
  | { type: "call"; name: string; args: Expr[] }
  | { type: "member"; object: Expr; field: string }
  | { type: "binary"; op: BinOp; left: Expr; right: Expr };

export type MatchArm = {
  /** Light kind name, or `_` wildcard. */
  pattern: string;
  body: Stmt[];
};

export type Stmt =
  | { type: "let"; name: string; expr: Expr }
  | { type: "ghost"; name: string; expr: Expr }
  | { type: "shine"; target: Expr; via?: string }
  | { type: "collapse"; name: string }
  | { type: "veil"; name: string; level: "public" | "private" | "selective" }
  | { type: "paint"; expr: Expr }
  | { type: "return"; expr: Expr }
  | { type: "when_light"; body: Stmt[] }
  | { type: "when_aperture"; condition: Expr; body: Stmt[] }
  | { type: "if"; condition: Expr; thenBody: Stmt[]; elseBody?: Stmt[] }
  | { type: "match"; scrutinee: Expr; arms: MatchArm[] }
  | { type: "ensure"; condition: Expr; message: string }
  | { type: "refuse"; message: string };

export interface Ray {
  name: string;
  params: string[];
  body: Stmt[];
}

export interface LumenModule {
  name: string;
  rays: Ray[];
}

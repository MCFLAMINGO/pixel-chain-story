/**
 * Lumen — light-native coding structure for Pixel.
 *
 * Better than general-purpose systems languages *for this problem* because
 * superposition, shine, aperture, collapse, maze, veil, and paint are the
 * instruction set — not bolted-on metaphors.
 */

export type { Expr, LumenModule, LumenValue, Ray, Stmt } from "./ast";
export { parseExpr, parseLumen, LumenParseError } from "./parse";
export { createHost, runLumenSource, runRay, type LumenHost, type LumenResult } from "./runtime";

// Re-export example source for the app / tests.
export const TRANSFER_LUMEN = `module Transfer

ray send(from, to, amount, memo):
  ghost tx = commit(from, to, amount, memo)
  veil tx private
  when light:
    shine tx via sequence
    collapse tx
    paint tx
  return tx

ray open_key(secret):
  let picture = maze(secret)
  shine picture via screen
  return picture

ray read_key(secret):
  let picture = project(secret)
  let key = recover(picture)
  return key

ray exist(what):
  ghost proof = attest(what)
  when light:
    paint proof
  return proof
`;

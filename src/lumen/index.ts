/**
 * Lumen — light-native coding structure for Pixel.
 *
 * Better than general-purpose systems languages *for this problem* because
 * superposition, shine, aperture, collapse, maze, veil, and paint are the
 * instruction set — not bolted-on metaphors.
 *
 * Power class (vs Rust): ownership of ghosts, match, ensure/refuse, aperture
 * gates, ray composition, field projection — for light physics, not RAM.
 */

export type { Expr, LumenModule, LumenValue, Ray, Stmt } from "./ast";
export { parseExpr, parseLumen, LumenParseError } from "./parse";
export {
  createHost,
  runLumenSource,
  runRay,
  LumenRuntimeError,
  type LumenHost,
  type LumenResult,
} from "./runtime";

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

ray tip_sense():
  ghost t = tip()
  when light:
    paint t
  return t

ray kindle(from, to, amount, memo):
  let pay = kindle(from, to, amount, memo)
  when light:
    paint pay
  return pay

ray shine_in(owner, usd):
  let r = shine_in(owner, usd)
  when light:
    paint r
  return r

ray holdings(who):
  let n = balance(who)
  return n

ray tip_wave():
  let t = tip()
  return t.waveDigest

ray funded_kindle(from, to, amount, memo):
  let n = balance(from)
  ensure n >= amount, "insufficient light"
  when aperture n > 0:
    let pay = kindle(from, to, amount, memo)
    match pay:
      settled:
        paint pay
        return pay
      _:
        refuse("kindle returned dark")
  refuse("empty aperture")

ray pay_composed(from, to, amount, memo):
  let n = balance(from)
  if n >= amount:
    return funded_kindle(from, to, amount, memo)
  else:
    refuse("cannot pay — holdings dark")
`;

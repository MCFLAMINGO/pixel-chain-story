/**
 * Lumen — light-native coding structure for Pixel.
 *
 * Better than general-purpose systems languages *for this problem* because
 * superposition, shine, aperture, collapse, maze, veil, and paint are the
 * instruction set — not bolted-on metaphors.
 *
 * Power class (vs Rust): ownership of ghosts, match, ensure/refuse, aperture
 * gates, ray composition, field projection, typed rays, modules beside chain.
 */

export type { Expr, LumenModule, LumenValue, Ray, Stmt, LightKind, TypedParam } from "./ast";
export { parseExpr, parseLumen, LumenParseError } from "./parse";
export {
  createHost,
  runLumenSource,
  runRay,
  LumenRuntimeError,
  type LumenHost,
  type LumenResult,
} from "./runtime";
export { checkLumen, LumenTypeError, type CheckDiag, type CheckResult } from "./check";
export { LIGHT_KINDS, BUILTIN_SIGS, isLightKind, kindsCompatible } from "./types";
export {
  LUMEN_MODULES_STORAGE_KEY,
  emptyLumenBundle,
  upsertLumenModule,
  activeLumenSource,
  validateLumenSource,
  parseLumenBundle,
  loadLumenBundleLocal,
  saveLumenBundleLocal,
  clearLumenBundleLocal,
  lumenPersistThesis,
  type PersistedLumenBundle,
  type PersistedLumenModule,
} from "./persist";

// Re-export example source for the app / tests.
export const TRANSFER_LUMEN = `module Transfer

ray send(from: string, to: string, amount: number, memo: string) -> settled:
  ghost tx: ghost = commit(from, to, amount, memo)
  veil tx private
  when light:
    shine tx via sequence
    collapse tx
    paint tx
  return tx

ray open_key(secret: string) -> picture:
  let picture: picture = maze(secret)
  shine picture via screen
  return picture

ray read_key(secret: string) -> string:
  let picture: picture = project(secret)
  let key: string = recover(picture)
  return key

ray exist(what: string) -> proof:
  ghost proof: proof = attest(what)
  when light:
    paint proof
  return proof

ray tip_sense() -> tip:
  ghost t: tip = tip()
  when light:
    paint t
  return t

ray kindle(from: string, to: string, amount: number, memo: string) -> settled:
  let pay: settled = kindle(from, to, amount, memo)
  when light:
    paint pay
  return pay

ray shine_in(owner: string, usd: number) -> settled:
  let r: settled = shine_in(owner, usd)
  when light:
    paint r
  return r

ray holdings(who: string) -> number:
  let n: number = balance(who)
  return n

ray tip_wave() -> string:
  let t: tip = tip()
  return t.waveDigest

ray funded_kindle(from: string, to: string, amount: number, memo: string) -> settled:
  let n: number = balance(from)
  ensure n >= amount, "insufficient light"
  when aperture n > 0:
    let pay: settled = kindle(from, to, amount, memo)
    match pay:
      settled:
        paint pay
        return pay
      _:
        refuse("kindle returned dark")
  refuse("empty aperture")

ray pay_composed(from: string, to: string, amount: number, memo: string) -> settled:
  let n: number = balance(from)
  if n >= amount:
    return funded_kindle(from, to, amount, memo)
  else:
    refuse("cannot pay — holdings dark")
`;

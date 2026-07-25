/**
 * Lumen runtime — executes light ceremonies against the Pixel chain.
 * This is the bridge: Lumen structure → real UTXO settlement + optical keys.
 *
 * Language power (same *class* as Rust, light-native):
 *   - ghost ownership: collapse consumes; re-shine refuses
 *   - match on light kinds
 *   - ensure / refuse (Result vocabulary)
 *   - when aperture <cond> (gated revelation)
 *   - ray composition (module rays callable like functions)
 *   - field projection + arithmetic / comparisons
 *
 * Hash complexity stays behind `digest` / `attest` (lightDigest).
 */

import {
  asOpticalPayload,
  attestExistence,
  balanceOf,
  confluentSeal,
  encodeMazeCard,
  encodeOpticalPattern,
  humanSummary,
  illuminateIngress,
  ingressUsd,
  kindleAccept,
  kindleOffer,
  lightDigest,
  proposeTransfer,
  sequenceBlock,
  settleKindling,
  simulateCameraCapture,
  verifyCapturedPattern,
  type LightKeypair,
  type PixelChainState,
  type Transaction,
} from "@/lib/pixel";
import type { BinOp, Expr, LumenModule, LumenValue, Ray, Stmt } from "./ast";
import { parseLumen } from "./parse";

const MAX_RAY_DEPTH = 32;

/** Runtime failure with light vocabulary (not a bare JS exception). */
export class LumenRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LumenRuntimeError";
  }
}

/** Early return from nested if / match / aperture blocks. */
class LumenReturn {
  constructor(public value: LumenValue) {}
}

export interface LumenHost {
  chain: PixelChainState;
  wallets: Record<string, LightKeypair>;
  /** Key used when this host sequences (usually alice / node key). */
  sequencer: LightKeypair;
  /**
   * Bridge escrow for `shine_in` — must hold PIX (usually genesis holder).
   * Defaults to sequencer when omitted.
   */
  bridgeVault?: LightKeypair;
  /** Named ghost txs awaiting light */
  ghosts: Map<string, Transaction>;
  /** Collapsed ghost ids — ownership: cannot re-enter superposition */
  consumed: Set<string>;
  painted: string[];
  log: string[];
}

export interface LumenResult {
  host: LumenHost;
  value: LumenValue;
  logs: string[];
}

export function createHost(
  chain: PixelChainState,
  wallets: Record<string, LightKeypair>,
  sequencer?: LightKeypair,
  opts?: { bridgeVault?: LightKeypair },
): LumenHost {
  const seq = sequencer ?? wallets.alice ?? Object.values(wallets)[0];
  if (!seq) throw new LumenRuntimeError("Lumen host needs a sequencer key");
  return {
    chain,
    wallets,
    sequencer: seq,
    bridgeVault: opts?.bridgeVault ?? seq,
    ghosts: new Map(),
    consumed: new Set(),
    painted: [],
    log: [],
  };
}

export async function runLumenSource(
  source: string,
  rayName: string,
  args: Record<string, LumenValue>,
  host: LumenHost,
): Promise<LumenResult> {
  const mod = parseLumen(source);
  return runRay(mod, rayName, args, host);
}

export async function runRay(
  mod: LumenModule,
  rayName: string,
  args: Record<string, LumenValue>,
  host: LumenHost,
  depth = 0,
): Promise<LumenResult> {
  if (depth > MAX_RAY_DEPTH) {
    throw new LumenRuntimeError(`ray recursion exceeded ${MAX_RAY_DEPTH} — light loop`);
  }
  const ray = mod.rays.find((r) => r.name === rayName);
  if (!ray) {
    throw new LumenRuntimeError(`ray '${rayName}' not found in module ${mod.name}`);
  }
  const env = new Map<string, LumenValue>(Object.entries(args));
  let value: LumenValue;
  try {
    value = await execBlock(ray.body, env, host, ray, mod, depth);
  } catch (e) {
    if (e instanceof LumenReturn) value = e.value;
    else throw e;
  }
  return { host, value, logs: [...host.log] };
}

async function execBlock(
  body: Stmt[],
  env: Map<string, LumenValue>,
  host: LumenHost,
  ray: Ray,
  mod: LumenModule,
  depth: number,
): Promise<LumenValue> {
  let last: LumenValue = { kind: "unit" };
  for (const stmt of body) {
    last = await execStmt(stmt, env, host, ray, mod, depth);
  }
  return last;
}

async function execStmt(
  stmt: Stmt,
  env: Map<string, LumenValue>,
  host: LumenHost,
  ray: Ray,
  mod: LumenModule,
  depth: number,
): Promise<LumenValue> {
  switch (stmt.type) {
    case "let": {
      const v = await evalExpr(stmt.expr, env, host, mod, depth);
      env.set(stmt.name, v);
      return v;
    }
    case "ghost": {
      const v = await evalExpr(stmt.expr, env, host, mod, depth);
      env.set(stmt.name, v);
      if (v.kind === "ghost") {
        if (host.consumed.has(v.id)) {
          throw new LumenRuntimeError(
            `ghost ${stmt.name} already collapsed — cannot re-bind consumed light`,
          );
        }
        host.log.push(`ghost ${stmt.name} held in superposition (${v.id.slice(0, 12)}…)`);
      }
      if (v.kind === "proof") {
        host.log.push(`ghost ${stmt.name} holds existence light ${v.light.slice(0, 12)}…`);
      }
      return v;
    }
    case "veil": {
      const g = env.get(stmt.name);
      if (g?.kind === "ghost") {
        assertGhostAlive(host, g.id, stmt.name);
        const tx = host.ghosts.get(g.id);
        if (tx) {
          tx.privacy = stmt.level;
          host.log.push(`veil ${stmt.name} → ${stmt.level}`);
        }
      } else if (g?.kind === "settled" && host.consumed.has(g.txid)) {
        throw new LumenRuntimeError(
          `veil ${stmt.name}: ghost already collapsed — ownership forbids re-entry (${g.txid.slice(0, 12)}…)`,
        );
      }
      return { kind: "unit" };
    }
    case "shine": {
      const target = await evalExpr(stmt.target, env, host, mod, depth);
      if (target.kind === "ghost") {
        assertGhostAlive(host, target.id, "shine target");
      }
      if (stmt.via === "sequence" || !stmt.via) {
        if (host.chain.pending.length > 0) {
          host.chain = await sequenceBlock(host.chain, host.sequencer);
          const tip = host.chain.pixels[host.chain.pixels.length - 1];
          for (const tx of tip.transactions) {
            host.ghosts.delete(tx.txid);
            host.log.push(`shine via sequence collapsed ${tx.txid.slice(0, 12)}…`);
            env.set("_last_settled", {
              kind: "settled",
              txid: tx.txid,
              summary: humanSummary(tx),
            });
          }
        }
      } else if (stmt.via === "screen") {
        if (target.kind === "picture") {
          env.set("_picture", target);
          host.log.push("shine via screen — picture holds the key");
          return target;
        }
        if (target.kind === "proof") {
          const picture = await encodeOpticalPattern(asOpticalPayload(target.light));
          const picVal: LumenValue = {
            kind: "picture",
            cells: picture.cells,
            checksum: picture.checksum,
            payloadHex: picture.payloadHex,
          };
          env.set("_picture", picVal);
          host.log.push("shine via screen — existence proof becomes light");
          return picVal;
        }
        if (target.kind === "ghost" || target.kind === "string") {
          const hex =
            target.kind === "string"
              ? target.value
              : String(target.payload.light ?? target.payload.commitment ?? "");
          const picture = await encodeOpticalPattern(asOpticalPayload(hex));
          const picVal: LumenValue = {
            kind: "picture",
            cells: picture.cells,
            checksum: picture.checksum,
            payloadHex: picture.payloadHex,
          };
          env.set("_picture", picVal);
          host.log.push("shine via screen — picture holds the key");
          return picVal;
        }
      }
      return { kind: "unit" };
    }
    case "collapse": {
      const g = env.get(stmt.name);
      if (g?.kind === "proof") {
        host.log.push(`collapse ${stmt.name} → existence already one truth`);
        return g;
      }
      if (g?.kind === "ghost") {
        assertGhostAlive(host, g.id, stmt.name);
        const settled = env.get("_last_settled");
        if (settled) {
          host.consumed.add(g.id);
          env.set(stmt.name, settled);
          host.log.push(`collapse ${stmt.name} → one truth (ghost consumed)`);
          return settled;
        }
      }
      const tip = host.chain.pixels[host.chain.pixels.length - 1];
      const tx = tip?.transactions[0];
      if (tx) {
        const settled: LumenValue = {
          kind: "settled",
          txid: tx.txid,
          summary: humanSummary(tx),
        };
        if (g?.kind === "ghost") host.consumed.add(g.id);
        env.set(stmt.name, settled);
        return settled;
      }
      return { kind: "unit" };
    }
    case "paint": {
      const v = await evalExpr(stmt.expr, env, host, mod, depth);
      const id = paintId(v);
      host.painted.push(id);
      host.log.push(`paint ledger pixel for ${id.slice(0, 12)}…`);
      return v;
    }
    case "when_light": {
      host.log.push("when light — aperture open");
      return execBlock(stmt.body, env, host, ray, mod, depth);
    }
    case "when_aperture": {
      const cond = await evalExpr(stmt.condition, env, host, mod, depth);
      if (!truthy(cond)) {
        host.log.push("when aperture — closed (condition dark)");
        return { kind: "unit" };
      }
      host.log.push("when aperture — open");
      return execBlock(stmt.body, env, host, ray, mod, depth);
    }
    case "if": {
      const cond = await evalExpr(stmt.condition, env, host, mod, depth);
      if (truthy(cond)) {
        return execBlock(stmt.thenBody, env, host, ray, mod, depth);
      }
      if (stmt.elseBody) {
        return execBlock(stmt.elseBody, env, host, ray, mod, depth);
      }
      return { kind: "unit" };
    }
    case "match": {
      const scrut = await evalExpr(stmt.scrutinee, env, host, mod, depth);
      const arm =
        stmt.arms.find((a) => a.pattern === scrut.kind) ?? stmt.arms.find((a) => a.pattern === "_");
      if (!arm) {
        throw new LumenRuntimeError(
          `match exhausted — no arm for kind '${scrut.kind}' (add \`_:\`)`,
        );
      }
      host.log.push(`match ${scrut.kind} → arm ${arm.pattern}`);
      return execBlock(arm.body, env, host, ray, mod, depth);
    }
    case "ensure": {
      const cond = await evalExpr(stmt.condition, env, host, mod, depth);
      if (!truthy(cond)) {
        throw new LumenRuntimeError(`ensure failed — ${stmt.message}`);
      }
      return { kind: "bool", value: true };
    }
    case "refuse":
      throw new LumenRuntimeError(`refuse — ${stmt.message}`);
    case "return": {
      const v = await evalExpr(stmt.expr, env, host, mod, depth);
      throw new LumenReturn(v);
    }
    default:
      return { kind: "unit" };
  }
}

async function evalExpr(
  expr: Expr,
  env: Map<string, LumenValue>,
  host: LumenHost,
  mod: LumenModule,
  depth: number,
): Promise<LumenValue> {
  switch (expr.type) {
    case "number":
      return { kind: "number", value: expr.value };
    case "string":
      return { kind: "string", value: expr.value };
    case "bool":
      return { kind: "bool", value: expr.value };
    case "ident": {
      const v = env.get(expr.name);
      if (!v) throw new LumenRuntimeError(`unknown name '${expr.name}'`);
      return v;
    }
    case "member": {
      const obj = await evalExpr(expr.object, env, host, mod, depth);
      return projectField(obj, expr.field);
    }
    case "binary": {
      const left = await evalExpr(expr.left, env, host, mod, depth);
      const right = await evalExpr(expr.right, env, host, mod, depth);
      return evalBinary(expr.op, left, right);
    }
    case "call":
      return evalCall(expr.name, expr.args, env, host, mod, depth);
  }
}

async function evalCall(
  name: string,
  args: Expr[],
  env: Map<string, LumenValue>,
  host: LumenHost,
  mod: LumenModule,
  depth: number,
): Promise<LumenValue> {
  const vals = await Promise.all(args.map((a) => evalExpr(a, env, host, mod, depth)));

  if (name === "commit") {
    const fromName = str(vals[0]);
    const toName = str(vals[1]);
    const amount = num(vals[2]);
    const memo = str(vals[3] ?? { kind: "string", value: "Lumen transfer" });
    const from = host.wallets[fromName];
    const to = host.wallets[toName];
    if (!from || !to) {
      throw new LumenRuntimeError(`commit: wallet missing (${fromName}/${toName})`);
    }

    const { state, tx } = await proposeTransfer(
      host.chain,
      from,
      [{ amount, address: to.address }],
      {
        description: memo,
        reference: `LUMEN-${Date.now()}`,
        recipientLabel: `@${toName}`,
      },
    );
    host.chain = state;
    host.ghosts.set(tx.txid, tx);
    return {
      kind: "ghost",
      id: tx.txid,
      payload: {
        light: tx.commitment,
        commitment: tx.commitment,
        amount,
        memo,
        from: from.address,
        to: to.address,
      },
    };
  }

  if (name === "balance") {
    const w = host.wallets[str(vals[0])];
    if (!w) throw new LumenRuntimeError("balance: unknown wallet");
    return { kind: "number", value: balanceOf(host.chain, w.address) };
  }

  if (name === "tip") {
    const tip = host.chain.pixels[host.chain.pixels.length - 1];
    if (!tip) throw new LumenRuntimeError("tip: empty chain");
    const sense: LumenValue = {
      kind: "tip",
      index: tip.index,
      tipHash: tip.hash,
      waveDigest: tip.lightProof.waveDigest,
      spatialRoot: tip.lightProof.spatialRoot,
    };
    host.log.push(
      `tip #${tip.index} wave ${tip.lightProof.waveDigest.slice(0, 12)}… spatial ${tip.lightProof.spatialRoot.slice(0, 12)}…`,
    );
    return sense;
  }

  if (name === "kindle") {
    const fromName = str(vals[0]);
    const toName = str(vals[1]);
    const amount = num(vals[2]);
    const memo = str(vals[3] ?? { kind: "string", value: "Lumen kindle" });
    const from = host.wallets[fromName];
    const to = host.wallets[toName];
    if (!from || !to) {
      throw new LumenRuntimeError(`kindle: wallet missing (${fromName}/${toName})`);
    }
    const intent = {
      fromLocal: fromName,
      toLocal: toName,
      amount,
      note: memo,
    };
    const offer = await kindleOffer(intent, { partyId: `${fromName}-offer` });
    const accept = await kindleAccept(intent, { partyId: `${toName}-accept` });
    const conf = await confluentSeal(offer, accept);
    if (!conf.ok) throw new LumenRuntimeError(`kindle: confluence ${conf.reason}`);
    const settled = await settleKindling({
      state: host.chain,
      from,
      ownerAddress: from.address,
      sequencer: host.sequencer,
      toAddress: to.address,
      seal: conf.seal,
    });
    host.chain = settled.state;
    const tipTx = settled.state.pixels[settled.state.pixels.length - 1]?.transactions[0];
    host.log.push(`kindle ${conf.seal.boundLabel} · ${settled.summary.slice(0, 96)}`);
    return {
      kind: "settled",
      txid: tipTx?.txid ?? settled.tipMark.txid,
      summary: settled.summary,
    };
  }

  if (name === "shine_in") {
    const ownerName = str(vals[0]);
    const usd = num(vals[1]);
    const owner = host.wallets[ownerName];
    if (!owner) throw new LumenRuntimeError(`shine_in: unknown wallet ${ownerName}`);
    const vault = host.bridgeVault ?? host.sequencer;
    const prepared = await ingressUsd(
      usd,
      { address: owner.address, localId: ownerName },
      `lumen-shine-${Date.now()}`,
    );
    const illuminated = await illuminateIngress({
      prepared,
      state: host.chain,
      bridgeVault: vault,
      sequencer: host.sequencer,
    });
    host.chain = illuminated.state;
    const tipTx = illuminated.state.pixels[illuminated.state.pixels.length - 1]?.transactions[0];
    host.log.push(`shine_in $${usd} → ${illuminated.pixCredited} PIX · ${ownerName}`);
    return {
      kind: "settled",
      txid: tipTx?.txid ?? illuminated.continuity.commitment ?? "shine_in",
      summary: illuminated.summary,
    };
  }

  if (name === "digest") {
    const label = str(vals[0]);
    const material = vals.slice(1).map(valueMaterial);
    const light = await lightDigest(label, ...material);
    return { kind: "string", value: light };
  }

  if (name === "attest") {
    const subject = valueMaterial(vals[0]);
    const extra = vals.slice(1).map(valueMaterial);
    const proof = await attestExistence(subject, extra);
    host.log.push(`attest existence ${proof.light.slice(0, 12)}… for ${subject.slice(0, 48)}`);
    return {
      kind: "proof",
      light: proof.light,
      subject: proof.subject,
      label: String(proof.kind),
      at: proof.at,
    };
  }

  if (name === "project") {
    const secret = str(vals[0]);
    const picture = await encodeOpticalPattern(asOpticalPayload(secret));
    return {
      kind: "picture",
      cells: picture.cells,
      checksum: picture.checksum,
      payloadHex: picture.payloadHex,
    };
  }

  if (name === "recover") {
    const pic = vals[0];
    if (pic.kind !== "picture") throw new LumenRuntimeError("recover expects picture");
    const captured = simulateCameraCapture(
      {
        cells: pic.cells,
        checksum: pic.checksum,
        width: 16,
        height: 16,
        payloadHex: pic.payloadHex,
      },
      0,
    );
    const result = await verifyCapturedPattern(captured, pic.checksum);
    if (!result.ok || !result.payload) {
      throw new LumenRuntimeError("recover failed — light did not align");
    }
    return { kind: "string", value: pic.payloadHex };
  }

  if (name === "maze") {
    const secret = str(vals[0]);
    host.log.push("maze cut — light will find the path");
    const picture = await encodeMazeCard(asOpticalPayload(secret));
    return {
      kind: "picture",
      cells: picture.cells,
      checksum: picture.checksum,
      payloadHex: picture.payloadHex,
    };
  }

  if (name === "kind_of") {
    return { kind: "string", value: vals[0]?.kind ?? "unit" };
  }

  // Ray composition — call another ray in this module (function power).
  const other = mod.rays.find((r) => r.name === name);
  if (other) {
    if (vals.length !== other.params.length) {
      throw new LumenRuntimeError(
        `ray ${name} expects ${other.params.length} args, got ${vals.length}`,
      );
    }
    const bound: Record<string, LumenValue> = {};
    other.params.forEach((p, i) => {
      bound[p] = vals[i]!;
    });
    const nested = await runRay(mod, name, bound, host, depth + 1);
    return nested.value;
  }

  throw new LumenRuntimeError(`unknown ray/builtin '${name}'`);
}

function assertGhostAlive(host: LumenHost, id: string, label: string): void {
  if (host.consumed.has(id)) {
    throw new LumenRuntimeError(
      `${label}: ghost already collapsed — ownership forbids re-entry (${id.slice(0, 12)}…)`,
    );
  }
}

function projectField(obj: LumenValue, field: string): LumenValue {
  switch (obj.kind) {
    case "tip": {
      const map: Record<string, LumenValue> = {
        index: { kind: "number", value: obj.index },
        tipHash: { kind: "string", value: obj.tipHash },
        waveDigest: { kind: "string", value: obj.waveDigest },
        spatialRoot: { kind: "string", value: obj.spatialRoot },
        kind: { kind: "string", value: "tip" },
      };
      const v = map[field];
      if (!v) throw new LumenRuntimeError(`tip has no field '${field}'`);
      return v;
    }
    case "proof": {
      const map: Record<string, LumenValue> = {
        light: { kind: "string", value: obj.light },
        subject: { kind: "string", value: obj.subject },
        label: { kind: "string", value: obj.label },
        at: { kind: "number", value: obj.at },
        kind: { kind: "string", value: "proof" },
      };
      const v = map[field];
      if (!v) throw new LumenRuntimeError(`proof has no field '${field}'`);
      return v;
    }
    case "settled": {
      const map: Record<string, LumenValue> = {
        txid: { kind: "string", value: obj.txid },
        summary: { kind: "string", value: obj.summary },
        kind: { kind: "string", value: "settled" },
      };
      const v = map[field];
      if (!v) throw new LumenRuntimeError(`settled has no field '${field}'`);
      return v;
    }
    case "ghost": {
      if (field === "id") return { kind: "string", value: obj.id };
      if (field === "kind") return { kind: "string", value: "ghost" };
      const raw = obj.payload[field];
      if (typeof raw === "number") return { kind: "number", value: raw };
      if (typeof raw === "string") return { kind: "string", value: raw };
      if (typeof raw === "boolean") return { kind: "bool", value: raw };
      throw new LumenRuntimeError(`ghost has no field '${field}'`);
    }
    case "picture": {
      const map: Record<string, LumenValue> = {
        checksum: { kind: "string", value: obj.checksum },
        payloadHex: { kind: "string", value: obj.payloadHex },
        kind: { kind: "string", value: "picture" },
      };
      const v = map[field];
      if (!v) throw new LumenRuntimeError(`picture has no field '${field}'`);
      return v;
    }
    default:
      throw new LumenRuntimeError(`cannot project '.${field}' from ${obj.kind}`);
  }
}

function evalBinary(op: BinOp, left: LumenValue, right: LumenValue): LumenValue {
  if (op === "==" || op === "!=") {
    const equal = lumenEqual(left, right);
    return { kind: "bool", value: op === "==" ? equal : !equal };
  }

  if (
    op === "+" ||
    op === "-" ||
    op === "*" ||
    op === "/" ||
    op === ">" ||
    op === "<" ||
    op === ">=" ||
    op === "<="
  ) {
    if (left.kind !== "number" || right.kind !== "number") {
      throw new LumenRuntimeError(`operator ${op} needs numbers, got ${left.kind}/${right.kind}`);
    }
    const a = left.value;
    const b = right.value;
    switch (op) {
      case "+":
        return { kind: "number", value: a + b };
      case "-":
        return { kind: "number", value: a - b };
      case "*":
        return { kind: "number", value: a * b };
      case "/":
        if (b === 0) throw new LumenRuntimeError("division by dark (zero)");
        return { kind: "number", value: a / b };
      case ">":
        return { kind: "bool", value: a > b };
      case "<":
        return { kind: "bool", value: a < b };
      case ">=":
        return { kind: "bool", value: a >= b };
      case "<=":
        return { kind: "bool", value: a <= b };
    }
  }
  throw new LumenRuntimeError(`unknown operator ${op}`);
}

function lumenEqual(a: LumenValue, b: LumenValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "number":
      return a.value === (b as typeof a).value;
    case "string":
    case "address":
      return a.value === (b as typeof a).value;
    case "bool":
      return a.value === (b as typeof a).value;
    case "unit":
      return true;
    case "ghost":
      return a.id === (b as typeof a).id;
    case "settled":
      return a.txid === (b as typeof a).txid;
    case "tip":
      return a.tipHash === (b as typeof a).tipHash;
    case "proof":
      return a.light === (b as typeof a).light;
    case "picture":
      return a.checksum === (b as typeof a).checksum;
  }
}

function truthy(v: LumenValue): boolean {
  switch (v.kind) {
    case "bool":
      return v.value;
    case "number":
      return v.value !== 0;
    case "string":
      return v.value.length > 0;
    case "unit":
      return false;
    default:
      return true;
  }
}

function paintId(v: LumenValue): string {
  switch (v.kind) {
    case "settled":
      return v.txid;
    case "ghost":
      return v.id;
    case "proof":
      return v.light;
    case "tip":
      return v.waveDigest;
    default:
      return "unit";
  }
}

function valueMaterial(v: LumenValue): string {
  switch (v.kind) {
    case "string":
    case "address":
      return v.value;
    case "number":
      return String(v.value);
    case "bool":
      return v.value ? "true" : "false";
    case "ghost":
      return String(v.payload.light ?? v.payload.commitment ?? v.id);
    case "settled":
      return v.txid;
    case "proof":
      return v.light;
    case "tip":
      return v.waveDigest;
    case "picture":
      return v.checksum;
    case "unit":
      return "unit";
  }
}

function str(v: LumenValue): string {
  if (v.kind === "string" || v.kind === "address") return v.value;
  throw new LumenRuntimeError(`expected string, got ${v.kind}`);
}

function num(v: LumenValue): number {
  if (v.kind === "number") return v.value;
  throw new LumenRuntimeError(`expected number, got ${v.kind}`);
}

export { parseLumen };

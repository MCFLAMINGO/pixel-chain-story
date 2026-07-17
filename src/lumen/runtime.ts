/**
 * Lumen runtime — executes light ceremonies against the Pixel chain.
 * This is the bridge: Lumen structure → real UTXO settlement + optical keys.
 *
 * Hash complexity stays behind `digest` / `attest` (lightDigest).
 * Authors never write sha512 domain separators or OTS leaf math.
 */

import {
  asOpticalPayload,
  attestExistence,
  balanceOf,
  encodeMazeCard,
  encodeOpticalPattern,
  humanSummary,
  lightDigest,
  proposeTransfer,
  sequenceBlock,
  simulateCameraCapture,
  verifyCapturedPattern,
  type LightKeypair,
  type PixelChainState,
  type Transaction,
} from "@/lib/pixel";
import type { Expr, LumenModule, LumenValue, Ray, Stmt } from "./ast";
import { parseLumen } from "./parse";

export interface LumenHost {
  chain: PixelChainState;
  wallets: Record<string, LightKeypair>;
  /** Key used when this host sequences (usually alice / node key). */
  sequencer: LightKeypair;
  /** Named ghost txs awaiting light */
  ghosts: Map<string, Transaction>;
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
): LumenHost {
  const seq = sequencer ?? wallets.alice ?? Object.values(wallets)[0];
  if (!seq) throw new Error("Lumen host needs a sequencer key");
  return {
    chain,
    wallets,
    sequencer: seq,
    ghosts: new Map(),
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
): Promise<LumenResult> {
  const ray = mod.rays.find((r) => r.name === rayName);
  if (!ray) throw new Error(`Lumen: ray '${rayName}' not found in module ${mod.name}`);
  const env = new Map<string, LumenValue>(Object.entries(args));
  const value = await execBlock(ray.body, env, host, ray);
  return { host, value, logs: [...host.log] };
}

async function execBlock(
  body: Stmt[],
  env: Map<string, LumenValue>,
  host: LumenHost,
  ray: Ray,
): Promise<LumenValue> {
  let last: LumenValue = { kind: "unit" };
  for (const stmt of body) {
    last = await execStmt(stmt, env, host, ray);
    if (stmt.type === "return") return last;
  }
  return last;
}

async function execStmt(
  stmt: Stmt,
  env: Map<string, LumenValue>,
  host: LumenHost,
  ray: Ray,
): Promise<LumenValue> {
  switch (stmt.type) {
    case "let": {
      const v = await evalExpr(stmt.expr, env, host);
      env.set(stmt.name, v);
      return v;
    }
    case "ghost": {
      const v = await evalExpr(stmt.expr, env, host);
      env.set(stmt.name, v);
      if (v.kind === "ghost") {
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
        const tx = host.ghosts.get(g.id);
        if (tx) {
          tx.privacy = stmt.level;
          host.log.push(`veil ${stmt.name} → ${stmt.level}`);
        }
      }
      return { kind: "unit" };
    }
    case "shine": {
      const target = await evalExpr(stmt.target, env, host);
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
        const settled = env.get("_last_settled");
        if (settled) {
          env.set(stmt.name, settled);
          host.log.push(`collapse ${stmt.name} → one truth`);
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
        env.set(stmt.name, settled);
        return settled;
      }
      return { kind: "unit" };
    }
    case "paint": {
      const v = await evalExpr(stmt.expr, env, host);
      const id =
        v.kind === "settled"
          ? v.txid
          : v.kind === "ghost"
            ? v.id
            : v.kind === "proof"
              ? v.light
              : "unit";
      host.painted.push(id);
      host.log.push(`paint ledger pixel for ${id.slice(0, 12)}…`);
      return v;
    }
    case "when_light": {
      host.log.push("when light — aperture open");
      return execBlock(stmt.body, env, host, ray);
    }
    case "return":
      return evalExpr(stmt.expr, env, host);
    default:
      return { kind: "unit" };
  }
}

async function evalExpr(
  expr: Expr,
  env: Map<string, LumenValue>,
  host: LumenHost,
): Promise<LumenValue> {
  switch (expr.type) {
    case "number":
      return { kind: "number", value: expr.value };
    case "string":
      return { kind: "string", value: expr.value };
    case "ident": {
      const v = env.get(expr.name);
      if (!v) throw new Error(`Lumen: unknown name '${expr.name}'`);
      return v;
    }
    case "call":
      return evalCall(expr.name, expr.args, env, host);
  }
}

async function evalCall(
  name: string,
  args: Expr[],
  env: Map<string, LumenValue>,
  host: LumenHost,
): Promise<LumenValue> {
  const vals = await Promise.all(args.map((a) => evalExpr(a, env, host)));

  if (name === "commit") {
    const fromName = str(vals[0]);
    const toName = str(vals[1]);
    const amount = num(vals[2]);
    const memo = str(vals[3] ?? { kind: "string", value: "Lumen transfer" });
    const from = host.wallets[fromName];
    const to = host.wallets[toName];
    if (!from || !to) throw new Error(`Lumen commit: wallet missing (${fromName}/${toName})`);

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
        /** Prefer `light` — commitment is the same hex via lightDigest. */
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
    if (!w) throw new Error("Lumen balance: unknown wallet");
    return { kind: "number", value: balanceOf(host.chain, w.address) };
  }

  /** One labeled hash — the complex hash issue becomes a verb. */
  if (name === "digest") {
    const label = str(vals[0]);
    const material = vals.slice(1).map(valueMaterial);
    const light = await lightDigest(label, ...material);
    return { kind: "string", value: light };
  }

  /**
   * Attest existence under light — store of creation.
   * Recomputable wherever lightDigest still runs (EMP elsewhere ≠ erasure here).
   */
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
    if (pic.kind !== "picture") throw new Error("recover expects picture");
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
    if (!result.ok || !result.payload) throw new Error("recover failed — light did not align");
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

  throw new Error(`Lumen: unknown ray/builtin '${name}'`);
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
    case "picture":
      return v.checksum;
    case "unit":
      return "unit";
  }
}

function str(v: LumenValue): string {
  if (v.kind === "string" || v.kind === "address") return v.value;
  throw new Error(`Lumen: expected string, got ${v.kind}`);
}

function num(v: LumenValue): number {
  if (v.kind === "number") return v.value;
  throw new Error(`Lumen: expected number, got ${v.kind}`);
}

export { parseLumen };

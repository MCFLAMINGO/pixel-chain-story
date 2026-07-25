/**
 * Static light check — refuse dark mismatches before host execution.
 * Progressive: untyped names are `any`; annotated rays get real teeth.
 */

import type { Expr, LumenModule, Ray, Stmt } from "./ast";
import { BUILTIN_SIGS, FIELD_TYPES, isLightKind, kindsCompatible, type LightKind } from "./types";

export class LumenTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LumenTypeError";
  }
}

export type CheckDiag = { level: "error" | "warn"; message: string };

export type CheckResult = {
  ok: boolean;
  diagnostics: CheckDiag[];
};

/**
 * Check a parsed module. Throws LumenTypeError when `strict` and errors exist;
 * otherwise returns diagnostics (errors ⇒ ok:false).
 */
export function checkLumen(mod: LumenModule, opts?: { strict?: boolean }): CheckResult {
  const diagnostics: CheckDiag[] = [];
  const raySigs = new Map<string, { params: LightKind[]; returns: LightKind }>();

  for (const ray of mod.rays) {
    for (const p of ray.params) {
      if (p.type && !isLightKind(p.type)) {
        diagnostics.push({
          level: "error",
          message: `ray ${ray.name}: unknown type '${p.type}' on param ${p.name}`,
        });
      }
    }
    if (ray.returnType && !isLightKind(ray.returnType)) {
      diagnostics.push({
        level: "error",
        message: `ray ${ray.name}: unknown return type '${ray.returnType}'`,
      });
    }
    raySigs.set(ray.name, {
      params: ray.params.map((p) => p.type ?? "any"),
      returns: ray.returnType ?? "any",
    });
  }

  for (const ray of mod.rays) {
    checkRay(ray, raySigs, diagnostics);
  }

  const errors = diagnostics.filter((d) => d.level === "error");
  const result = { ok: errors.length === 0, diagnostics };
  if (opts?.strict && !result.ok) {
    throw new LumenTypeError(errors.map((e) => e.message).join("; "));
  }
  return result;
}

function checkRay(
  ray: Ray,
  raySigs: Map<string, { params: LightKind[]; returns: LightKind }>,
  diagnostics: CheckDiag[],
): void {
  const env = new Map<string, LightKind>();
  for (const p of ray.params) {
    env.set(p.name, p.type ?? "any");
  }
  const returns = checkBlock(ray.body, env, raySigs, diagnostics, ray.name);
  if (ray.returnType && ray.returnType !== "any") {
    if (returns.length === 0) {
      diagnostics.push({
        level: "error",
        message: `ray ${ray.name}: annotated -> ${ray.returnType} but no return`,
      });
    }
    for (const r of returns) {
      if (!kindsCompatible(ray.returnType, r)) {
        diagnostics.push({
          level: "error",
          message: `ray ${ray.name}: returns ${r} but annotated -> ${ray.returnType}`,
        });
      }
    }
  }
}

function checkBlock(
  body: Stmt[],
  env: Map<string, LightKind>,
  raySigs: Map<string, { params: LightKind[]; returns: LightKind }>,
  diagnostics: CheckDiag[],
  rayName: string,
): LightKind[] {
  const returns: LightKind[] = [];
  for (const stmt of body) {
    returns.push(...checkStmt(stmt, env, raySigs, diagnostics, rayName));
  }
  return returns;
}

function checkStmt(
  stmt: Stmt,
  env: Map<string, LightKind>,
  raySigs: Map<string, { params: LightKind[]; returns: LightKind }>,
  diagnostics: CheckDiag[],
  rayName: string,
): LightKind[] {
  switch (stmt.type) {
    case "let":
    case "ghost": {
      const inferred = inferExpr(stmt.expr, env, raySigs, diagnostics, rayName);
      const annotated = stmt.typeAnn;
      if (annotated) {
        if (!isLightKind(annotated)) {
          diagnostics.push({
            level: "error",
            message: `${rayName}: unknown type '${annotated}' on ${stmt.name}`,
          });
        } else if (!kindsCompatible(annotated, inferred)) {
          diagnostics.push({
            level: "error",
            message: `${rayName}: ${stmt.name} annotated ${annotated} but expr is ${inferred}`,
          });
        }
        env.set(stmt.name, annotated);
      } else {
        env.set(stmt.name, stmt.type === "ghost" && inferred === "any" ? "ghost" : inferred);
      }
      return [];
    }
    case "return": {
      return [inferExpr(stmt.expr, env, raySigs, diagnostics, rayName)];
    }
    case "ensure": {
      const t = inferExpr(stmt.condition, env, raySigs, diagnostics, rayName);
      if (t !== "bool" && t !== "any" && t !== "number") {
        diagnostics.push({
          level: "warn",
          message: `${rayName}: ensure condition is ${t} (want bool/number)`,
        });
      }
      return [];
    }
    case "refuse":
      return [];
    case "paint":
      inferExpr(stmt.expr, env, raySigs, diagnostics, rayName);
      return [];
    case "shine":
      inferExpr(stmt.target, env, raySigs, diagnostics, rayName);
      return [];
    case "collapse":
      // Measurement — binding becomes settled (ownership consume at runtime).
      if (env.has(stmt.name)) env.set(stmt.name, "settled");
      return [];
    case "veil":
      return [];
    case "when_light":
      return checkBlock(stmt.body, env, raySigs, diagnostics, rayName);
    case "when_aperture": {
      inferExpr(stmt.condition, env, raySigs, diagnostics, rayName);
      return checkBlock(stmt.body, env, raySigs, diagnostics, rayName);
    }
    case "if": {
      inferExpr(stmt.condition, env, raySigs, diagnostics, rayName);
      const a = checkBlock(stmt.thenBody, new Map(env), raySigs, diagnostics, rayName);
      const b = stmt.elseBody
        ? checkBlock(stmt.elseBody, new Map(env), raySigs, diagnostics, rayName)
        : [];
      return [...a, ...b];
    }
    case "match": {
      const scrut = inferExpr(stmt.scrutinee, env, raySigs, diagnostics, rayName);
      const out: LightKind[] = [];
      for (const arm of stmt.arms) {
        if (arm.pattern !== "_" && !isLightKind(arm.pattern)) {
          diagnostics.push({
            level: "error",
            message: `${rayName}: match arm '${arm.pattern}' is not a light kind`,
          });
        }
        const armEnv = new Map(env);
        if (arm.pattern !== "_" && isLightKind(arm.pattern)) {
          // narrow scrutinee name if it was an ident — best effort skip
          void scrut;
        }
        out.push(...checkBlock(arm.body, armEnv, raySigs, diagnostics, rayName));
      }
      return out;
    }
    default:
      return [];
  }
}

function inferExpr(
  expr: Expr,
  env: Map<string, LightKind>,
  raySigs: Map<string, { params: LightKind[]; returns: LightKind }>,
  diagnostics: CheckDiag[],
  rayName: string,
): LightKind {
  switch (expr.type) {
    case "number":
      return "number";
    case "string":
      return "string";
    case "bool":
      return "bool";
    case "ident":
      return env.get(expr.name) ?? "any";
    case "member": {
      const obj = inferExpr(expr.object, env, raySigs, diagnostics, rayName);
      if (obj === "any") return "any";
      const fields = FIELD_TYPES[obj];
      if (!fields) {
        diagnostics.push({
          level: "error",
          message: `${rayName}: cannot project '.${expr.field}' from ${obj}`,
        });
        return "any";
      }
      const ft = fields[expr.field];
      if (!ft) {
        diagnostics.push({
          level: "error",
          message: `${rayName}: ${obj} has no field '${expr.field}'`,
        });
        return "any";
      }
      return ft;
    }
    case "binary": {
      const l = inferExpr(expr.left, env, raySigs, diagnostics, rayName);
      const r = inferExpr(expr.right, env, raySigs, diagnostics, rayName);
      if (expr.op === "==" || expr.op === "!=") return "bool";
      if (expr.op === ">" || expr.op === "<" || expr.op === ">=" || expr.op === "<=") {
        return "bool";
      }
      if ((l !== "number" && l !== "any") || (r !== "number" && r !== "any")) {
        diagnostics.push({
          level: "error",
          message: `${rayName}: arithmetic ${expr.op} needs numbers (got ${l}/${r})`,
        });
      }
      return "number";
    }
    case "call":
      return inferCall(expr.name, expr.args, env, raySigs, diagnostics, rayName);
  }
}

function inferCall(
  name: string,
  args: Expr[],
  env: Map<string, LightKind>,
  raySigs: Map<string, { params: LightKind[]; returns: LightKind }>,
  diagnostics: CheckDiag[],
  rayName: string,
): LightKind {
  const argTypes = args.map((a) => inferExpr(a, env, raySigs, diagnostics, rayName));
  const builtin = BUILTIN_SIGS[name];
  const ray = raySigs.get(name);
  const sig = builtin ?? ray;
  if (!sig) {
    diagnostics.push({
      level: "error",
      message: `${rayName}: unknown ray/builtin '${name}'`,
    });
    return "any";
  }
  if (!builtin?.variadic && argTypes.length !== sig.params.length) {
    // kindle/commit last memo often optional at runtime — allow trailing string omit
    const optionalTrailing =
      (name === "kindle" || name === "commit") && argTypes.length === sig.params.length - 1;
    if (!optionalTrailing) {
      diagnostics.push({
        level: "error",
        message: `${rayName}: ${name} expects ${sig.params.length} args, got ${argTypes.length}`,
      });
    }
  }
  const n = Math.min(argTypes.length, sig.params.length);
  for (let i = 0; i < n; i++) {
    if (!kindsCompatible(sig.params[i]!, argTypes[i]!)) {
      diagnostics.push({
        level: "error",
        message: `${rayName}: ${name} arg${i} want ${sig.params[i]}, got ${argTypes[i]}`,
      });
    }
  }
  return sig.returns;
}

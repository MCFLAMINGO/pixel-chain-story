/**
 * Minimal Lumen REPL — lab teaching surface for let / print + prefix arithmetic.
 *
 * Not the product Lumen language (`parseLumen` / rays / ghosts). This is a small
 * prefix-expression interpreter for `example.lumen` and CLI drills.
 *
 *   bun src/lumen/repl.ts src/lumen/example.lumen
 *
 * Syntax:
 *   let name = EXPR
 *   print EXPR
 *   EXPR := number | name | add|sub|mul|div ARG…
 */

import { readFileSync } from "node:fs";

type Env = Record<string, number>;

function tokenizeLine(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

function evalExpr(tokens: string[], env: Env): number {
  if (tokens.length === 0) throw new Error("empty expression");
  if (tokens.length === 1) {
    const t = tokens[0]!;
    const n = Number(t);
    if (!Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(t)) return n;
    if (t in env) return env[t]!;
    throw new Error(`Unknown identifier ${t}`);
  }
  const op = tokens[0]!;
  const args = tokens.slice(1).map((t) => {
    const n = Number(t);
    if (!Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(t)) return n;
    if (t in env) return env[t]!;
    throw new Error(`Unknown identifier ${t}`);
  });
  switch (op) {
    case "add":
      return args.reduce((a, b) => a + b, 0);
    case "sub":
      return args.slice(1).reduce((a, b) => a - b, args[0] ?? 0);
    case "mul":
      return args.reduce((a, b) => a * b, 1);
    case "div": {
      if (args.slice(1).some((b) => b === 0)) throw new Error("div by zero");
      return args.slice(1).reduce((a, b) => a / b, args[0] ?? 1);
    }
    default:
      throw new Error(`Unknown operator ${op}`);
  }
}

/** Run a minimal Lumen program; returns printed values as strings. */
export function runLumen(program: string): string[] {
  const lines = program.split(/\r?\n/);
  const env: Env = {};
  const output: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*/g, "").replace(/;.*/g, "").trim();
    if (!line) continue;
    const parts = tokenizeLine(line);
    if (parts[0] === "let") {
      const name = parts[1];
      const eq = parts[2];
      if (!name || eq !== "=") throw new Error(`Invalid let syntax: ${line}`);
      env[name] = evalExpr(parts.slice(3), env);
      continue;
    }
    if (parts[0] === "print") {
      output.push(String(evalExpr(parts.slice(1), env)));
      continue;
    }
    evalExpr(parts, env);
  }
  return output;
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.log("Usage: bun src/lumen/repl.ts <file.lumen>");
    process.exit(1);
  }
  const out = runLumen(readFileSync(file, "utf8"));
  for (const o of out) console.log(o);
}

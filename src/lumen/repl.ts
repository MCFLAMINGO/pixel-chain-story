// Minimal LUMEN REPL — supports `let NAME = EXPR`, `print EXPR`, and simple prefix ops: add, sub, mul, div
// Exported runLumen(program) returns array of printed values (strings).
import { readFileSync } from "node:fs";

type Env = Record<string, number>;

function tokenizeLine(line: string) {
  return line.trim().split(/\s+/).filter(Boolean);
}

function evalExpr(tokens: string[], env: Env): number {
  // If single number or identifier
  if (tokens.length === 1) {
    const t = tokens[0];
    const n = Number(t);
    if (!Number.isNaN(n)) return n;
    if (t in env) return env[t];
    throw new Error(`Unknown identifier ${t}`);
  }
  // prefix op: add x y
  const op = tokens[0];
  const args = tokens.slice(1).map((t) => {
    const n = Number(t);
    if (!Number.isNaN(n)) return n;
    if (t in env) return env[t];
    throw new Error(`Unknown identifier ${t}`);
  });
  switch (op) {
    case "add":
      return args.reduce((a, b) => a + b, 0);
    case "sub":
      return args.slice(1).reduce((a, b) => a - b, args[0] ?? 0);
    case "mul":
      return args.reduce((a, b) => a * b, 1);
    case "div":
      return args.slice(1).reduce((a, b) => a / b, args[0] ?? 1);
    default:
      throw new Error(`Unknown operator ${op}`);
  }
}

export function runLumen(program: string): string[] {
  const lines = program.split(/\r?\n/);
  const env: Env = {};
  const output: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const parts = tokenizeLine(line);
    if (parts[0] === "let") {
      // let name = expr...
      const name = parts[1];
      const eq = parts[2];
      if (!name || eq !== "=") throw new Error("Invalid let syntax");
      const expr = parts.slice(3);
      env[name] = evalExpr(expr, env);
      continue;
    }
    if (parts[0] === "print") {
      const expr = parts.slice(1);
      const val = evalExpr(expr, env);
      output.push(String(val));
      continue;
    }
    // expression by itself -> evaluate and drop
    try {
      evalExpr(parts, env);
    } catch (err) {
      throw new Error(`Error evaluating line "${line}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return output;
}

// CLI: bun run src/lumen/repl.ts <file.lumen>
if (process.argv[1].endsWith("/repl.ts") && require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.log("Usage: bun run src/lumen/repl.ts <file.lumen>");
    process.exit(1);
  }
  const prog = readFileSync(file, "utf8");
  const out = runLumen(prog);
  for (const o of out) console.log(o);
}

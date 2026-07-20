/**
 * Lumen parser — intentional, readable, light-ceremony syntax.
 *
 * Example:
 *
 *   module Transfer
 *
 *   ray send(from, to, amount, memo):
 *     ghost tx = commit(from, to, amount, memo)
 *     veil tx private
 *     when light:
 *       shine tx via sequence
 *       collapse tx
 *       paint tx
 *     return tx
 */

import type { Expr, LumenModule, Ray, Stmt } from "./ast";

export class LumenParseError extends Error {
  constructor(
    message: string,
    public line: number,
  ) {
    super(`Lumen parse error on line ${line}: ${message}`);
    this.name = "LumenParseError";
  }
}

export function parseLumen(source: string): LumenModule {
  const lines = source
    .split(/\r?\n/)
    .map((l, i) => ({ text: stripComment(l), n: i + 1 }))
    .filter((l) => l.text.trim().length > 0);

  let i = 0;
  const peek = () => lines[i];
  const next = () => lines[i++];

  const modLine = next();
  if (!modLine || !/^module\s+\w+/.test(modLine.text.trim())) {
    throw new LumenParseError("expected `module Name`", modLine?.n ?? 1);
  }
  const moduleName = modLine.text.trim().split(/\s+/)[1];
  const rays: Ray[] = [];

  while (i < lines.length) {
    const line = peek();
    if (!line) break;
    const t = line.text.trim();
    if (t.startsWith("ray ")) {
      rays.push(parseRay());
    } else {
      throw new LumenParseError(`unexpected: ${t}`, line.n);
    }
  }

  return { name: moduleName, rays };

  function parseRay(): Ray {
    const header = next();
    const m = header.text.trim().match(/^ray\s+(\w+)\(([^)]*)\):\s*$/);
    if (!m) throw new LumenParseError("bad ray header", header.n);
    const name = m[1];
    const params = m[2]
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const body = parseBlock(baseIndent(header.text) + 1);
    return { name, params, body };
  }

  function parseBlock(minIndent: number): Stmt[] {
    const body: Stmt[] = [];
    while (i < lines.length) {
      const line = peek();
      if (!line) break;
      const ind = baseIndent(line.text);
      if (ind < minIndent) break;
      if (ind > minIndent && body.length === 0) {
        throw new LumenParseError("unexpected indent", line.n);
      }
      if (ind > minIndent) break;
      body.push(parseStmt(minIndent));
    }
    return body;
  }

  function parseStmt(indent: number): Stmt {
    const line = next();
    const t = line.text.trim();

    if (t.startsWith("ghost ")) {
      const m = t.match(/^ghost\s+(\w+)\s*=\s*(.+)$/);
      if (!m) throw new LumenParseError("ghost binding", line.n);
      return { type: "ghost", name: m[1], expr: parseExpr(m[2], line.n) };
    }
    if (t.startsWith("let ")) {
      const m = t.match(/^let\s+(\w+)\s*=\s*(.+)$/);
      if (!m) throw new LumenParseError("let binding", line.n);
      return { type: "let", name: m[1], expr: parseExpr(m[2], line.n) };
    }
    if (t.startsWith("shine ")) {
      const m = t.match(/^shine\s+(\w+)(?:\s+via\s+(\w+))?$/);
      if (!m) throw new LumenParseError("shine", line.n);
      return {
        type: "shine",
        target: { type: "ident", name: m[1] },
        via: m[2],
      };
    }
    if (t.startsWith("collapse ")) {
      return { type: "collapse", name: t.slice("collapse ".length).trim() };
    }
    if (t.startsWith("veil ")) {
      const m = t.match(/^veil\s+(\w+)\s+(public|private|selective)$/);
      if (!m) throw new LumenParseError("veil level", line.n);
      return {
        type: "veil",
        name: m[1],
        level: m[2] as "public" | "private" | "selective",
      };
    }
    if (t.startsWith("paint ")) {
      return {
        type: "paint",
        expr: parseExpr(t.slice("paint ".length).trim(), line.n),
      };
    }
    if (t.startsWith("return ")) {
      return {
        type: "return",
        expr: parseExpr(t.slice("return ".length).trim(), line.n),
      };
    }
    if (t === "when light:") {
      const inner = parseBlock(indent + 1);
      return { type: "when_light", body: inner };
    }
    throw new LumenParseError(`unknown statement: ${t}`, line.n);
  }
}

function stripComment(line: string): string {
  const idx = line.indexOf("//");
  return idx >= 0 ? line.slice(0, idx) : line;
}

function baseIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  const ws = m?.[1] ?? "";
  // 2 spaces = 1 indent level
  return Math.floor(ws.replace(/\t/g, "  ").length / 2);
}

export function parseExpr(raw: string, line = 1): Expr {
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return { type: "number", value: Number(s) };
  if (/^".*"$/.test(s) || /^'.*'$/.test(s)) {
    return { type: "string", value: s.slice(1, -1) };
  }
  const call = s.match(/^(\w+)\((.*)\)$/);
  if (call) {
    const args = splitArgs(call[2]).map((a) => parseExpr(a, line));
    return { type: "call", name: call[1], args };
  }
  if (/^\w+$/.test(s)) return { type: "ident", name: s };
  throw new LumenParseError(`bad expression: ${s}`, line);
}

function splitArgs(inner: string): string[] {
  if (!inner.trim()) return [];
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

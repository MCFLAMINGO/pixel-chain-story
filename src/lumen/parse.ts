/**
 * Lumen parser — intentional, readable, light-ceremony syntax.
 *
 * Language power (light-native, not a Rust clone):
 *   if / else, match on kinds, when aperture <cond>, ensure / refuse,
 *   binary ops, field projection, ray composition via calls.
 */

import type { BinOp, Expr, LumenModule, MatchArm, Ray, Stmt } from "./ast";

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
    const line = next()!;
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
    if (t.startsWith("ensure ")) {
      const m = t.match(/^ensure\s+(.+),\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*$/);
      if (!m) throw new LumenParseError('ensure <cond>, "message"', line.n);
      return {
        type: "ensure",
        condition: parseExpr(m[1], line.n),
        message: unquote(m[2]),
      };
    }
    if (t.startsWith("refuse(") && t.endsWith(")")) {
      const inner = t.slice("refuse(".length, -1).trim();
      const msg = parseExpr(inner, line.n);
      if (msg.type !== "string") throw new LumenParseError('refuse("message")', line.n);
      return { type: "refuse", message: msg.value };
    }
    if (t === "when light:") {
      return { type: "when_light", body: parseBlock(indent + 1) };
    }
    if (t.startsWith("when aperture ") && t.endsWith(":")) {
      const condRaw = t.slice("when aperture ".length, -1).trim();
      if (!condRaw) throw new LumenParseError("when aperture <cond>:", line.n);
      return {
        type: "when_aperture",
        condition: parseExpr(condRaw, line.n),
        body: parseBlock(indent + 1),
      };
    }
    if (t.startsWith("if ") && t.endsWith(":")) {
      const condRaw = t.slice(3, -1).trim();
      const thenBody = parseBlock(indent + 1);
      let elseBody: Stmt[] | undefined;
      const after = peek();
      if (after && baseIndent(after.text) === indent && after.text.trim() === "else:") {
        next();
        elseBody = parseBlock(indent + 1);
      }
      return {
        type: "if",
        condition: parseExpr(condRaw, line.n),
        thenBody,
        elseBody,
      };
    }
    if (t.startsWith("match ") && t.endsWith(":")) {
      const scrutRaw = t.slice("match ".length, -1).trim();
      const arms = parseMatchArms(indent + 1);
      return {
        type: "match",
        scrutinee: parseExpr(scrutRaw, line.n),
        arms,
      };
    }
    throw new LumenParseError(`unknown statement: ${t}`, line.n);
  }

  function parseMatchArms(armIndent: number): MatchArm[] {
    const arms: MatchArm[] = [];
    while (i < lines.length) {
      const line = peek();
      if (!line) break;
      const ind = baseIndent(line.text);
      if (ind < armIndent) break;
      if (ind > armIndent) {
        throw new LumenParseError("match arm indent", line.n);
      }
      const header = next()!;
      const m = header.text.trim().match(/^(\w+|_):\s*$/);
      if (!m) throw new LumenParseError("match arm `kind:` or `_:`", header.n);
      arms.push({
        pattern: m[1],
        body: parseBlock(armIndent + 1),
      });
    }
    if (arms.length === 0) throw new LumenParseError("match needs arms", peek()?.n ?? 1);
    return arms;
  }
}

function unquote(s: string): string {
  return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
}

function stripComment(line: string): string {
  const idx = line.indexOf("//");
  return idx >= 0 ? line.slice(0, idx) : line;
}

function baseIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  const ws = m?.[1] ?? "";
  return Math.floor(ws.replace(/\t/g, "  ").length / 2);
}

/** Public expression parser — recursive descent with precedence. */
export function parseExpr(raw: string, line = 1): Expr {
  const tokens = tokenize(raw, line);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseComparison(): Expr {
    let left = parseAdd();
    while (peek() && isCmp(peek()!.kind)) {
      const op = next()!.kind as BinOp;
      const right = parseAdd();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  function parseAdd(): Expr {
    let left = parseMul();
    while (peek() && (peek()!.kind === "+" || peek()!.kind === "-")) {
      const op = next()!.kind as BinOp;
      const right = parseMul();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  function parseMul(): Expr {
    let left = parsePrimary();
    while (peek() && (peek()!.kind === "*" || peek()!.kind === "/")) {
      const op = next()!.kind as BinOp;
      const right = parsePrimary();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  function parsePrimary(): Expr {
    const tok = next();
    if (!tok) throw new LumenParseError("unexpected end of expression", line);

    if (tok.kind === "number") return { type: "number", value: Number(tok.value) };
    if (tok.kind === "string") return { type: "string", value: tok.value };
    if (tok.kind === "true") return { type: "bool", value: true };
    if (tok.kind === "false") return { type: "bool", value: false };

    if (tok.kind === "ident") {
      let expr: Expr = { type: "ident", name: tok.value };
      if (peek()?.kind === "(") {
        next(); // (
        const args: Expr[] = [];
        if (peek()?.kind !== ")") {
          args.push(parseComparison());
          while (peek()?.kind === ",") {
            next();
            args.push(parseComparison());
          }
        }
        if (next()?.kind !== ")") throw new LumenParseError("expected ')'", line);
        expr = { type: "call", name: tok.value, args };
      }
      while (peek()?.kind === ".") {
        next();
        const field = next();
        if (!field || field.kind !== "ident") {
          throw new LumenParseError("expected field after '.'", line);
        }
        expr = { type: "member", object: expr, field: field.value };
      }
      return expr;
    }

    throw new LumenParseError(`bad expression token '${tok.kind}'`, line);
  }

  const expr = parseComparison();
  if (pos < tokens.length) {
    throw new LumenParseError(`trailing tokens in expression: ${raw}`, line);
  }
  return expr;
}

type Tok =
  | { kind: "number"; value: string }
  | { kind: "string"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "true" }
  | { kind: "false" }
  | { kind: BinOp | "(" | ")" | "," | "." };

function isCmp(k: string): boolean {
  return k === ">" || k === "<" || k === ">=" || k === "<=" || k === "==" || k === "!=";
}

function tokenize(raw: string, line: number): Tok[] {
  const s = raw.trim();
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      let v = "";
      while (i < s.length && s[i] !== q) {
        if (s[i] === "\\") {
          i++;
          v += s[i] ?? "";
        } else {
          v += s[i];
        }
        i++;
      }
      if (s[i] !== q) throw new LumenParseError("unterminated string", line);
      i++;
      out.push({ kind: "string", value: v });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let v = "";
      while (i < s.length && /[0-9.]/.test(s[i]!)) v += s[i++];
      out.push({ kind: "number", value: v });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let v = "";
      while (i < s.length && /\w/.test(s[i]!)) v += s[i++];
      if (v === "true") out.push({ kind: "true" });
      else if (v === "false") out.push({ kind: "false" });
      else out.push({ kind: "ident", value: v });
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === ">=" || two === "<=" || two === "==" || two === "!=") {
      out.push({ kind: two });
      i += 2;
      continue;
    }
    if ("+-*/><(),.".includes(ch)) {
      out.push({ kind: ch as Tok["kind"] });
      i++;
      continue;
    }
    throw new LumenParseError(`bad character '${ch}' in expression`, line);
  }
  return out;
}

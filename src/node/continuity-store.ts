/**
 * Continuity ops + settlement session on disk (Pixel node datadir).
 * Shared invites / webhooks — not browser localStorage theater.
 */

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { emptyOpsState, type ContinuityOpsState } from "../lib/pixel/continuity-ops";
import {
  type ContinuitySessionBlob,
  importContinuitySession,
  exportContinuitySession,
  type ContinuitySession,
} from "../lib/pixel/continuity-settlement";

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}

export function continuityOpsPath(datadir: string): string {
  return join(datadir, "continuity-ops.json");
}

export function continuitySessionPath(datadir: string): string {
  return join(datadir, "continuity-session.json");
}

export async function loadContinuityOps(datadir: string): Promise<ContinuityOpsState> {
  try {
    const raw = await readFile(continuityOpsPath(datadir), "utf8");
    const parsed = JSON.parse(raw) as ContinuityOpsState;
    if (!parsed?.rungs?.length || !Array.isArray(parsed.stores)) return emptyOpsState();
    return parsed;
  } catch {
    return emptyOpsState("Node Continuity");
  }
}

export async function saveContinuityOps(datadir: string, state: ContinuityOpsState): Promise<void> {
  await mkdir(datadir, { recursive: true });
  await writeJsonAtomic(continuityOpsPath(datadir), state);
}

export async function loadContinuitySessionBlob(
  datadir: string,
): Promise<ContinuitySessionBlob | null> {
  try {
    const raw = await readFile(continuitySessionPath(datadir), "utf8");
    return JSON.parse(raw) as ContinuitySessionBlob;
  } catch {
    return null;
  }
}

export async function saveContinuitySessionBlob(
  datadir: string,
  blob: ContinuitySessionBlob,
): Promise<void> {
  await mkdir(datadir, { recursive: true });
  await writeJsonAtomic(continuitySessionPath(datadir), blob);
}

export async function loadContinuitySession(datadir: string): Promise<ContinuitySession | null> {
  const blob = await loadContinuitySessionBlob(datadir);
  if (!blob) return null;
  return importContinuitySession(blob);
}

export async function saveContinuitySession(
  datadir: string,
  session: ContinuitySession,
): Promise<void> {
  await saveContinuitySessionBlob(datadir, await exportContinuitySession(session));
}

/**
 * Lumen modules on disk beside chain.json (Pixel node datadir).
 */

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { emptyLumenBundle, parseLumenBundle, type PersistedLumenBundle } from "../lumen/persist";

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}

export function lumenModulesPath(datadir: string): string {
  return join(datadir, "lumen-modules.json");
}

export async function loadLumenModules(datadir: string): Promise<PersistedLumenBundle | null> {
  try {
    const raw = await readFile(lumenModulesPath(datadir), "utf8");
    return parseLumenBundle(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveLumenModules(
  datadir: string,
  bundle: PersistedLumenBundle,
): Promise<void> {
  await mkdir(datadir, { recursive: true });
  await writeJsonAtomic(lumenModulesPath(datadir), bundle);
}

/** Load or seed a module bundle beside chain.json. */
export async function loadOrSeedLumenModules(
  datadir: string,
  seedSource: string,
): Promise<PersistedLumenBundle> {
  const existing = await loadLumenModules(datadir);
  if (existing && existing.modules.length > 0) return existing;
  const seeded = emptyLumenBundle({ name: "Transfer", source: seedSource });
  await saveLumenModules(datadir, seeded);
  return seeded;
}

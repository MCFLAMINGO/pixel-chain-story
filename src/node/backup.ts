/**
 * One file you can hand to somebody, and one command that proves it restores.
 *
 * The requirement everything is ranked against is "I need to be able to walk away and it
 * works", and today one Railway volume holds the only copy of the history **and** the only
 * key that can extend it. The anchors would prove a picture existed and what its digest
 * was; nobody could reconstruct a single pixel of it.
 *
 * The fix is not code, it is a second copy in somebody else's hands. But whether that
 * happens depends entirely on how many steps it takes, so this makes it two: one command to
 * write the file, one to restore it.
 *
 * ## Two different things live in that volume, and they need different numbers of copies
 *
 * - **The history** needs to be *everywhere*. It is public, it needs no trust, and every
 *   copy makes the chain harder to lose.
 * - **The sequencer key** extends the chain. It needs more than one copy and fewer than
 *   many, and every copy is a trust decision.
 *
 * Bundling them together forces the cautious answer on both, so the key is left out unless
 * `includeKey` is set, and the manifest always says which kind of bundle this is. A friend
 * can hold the whole picture without being handed the ability to write to it.
 *
 * ## A backup nobody has restored is not a backup
 *
 * The failure this is really guarding against is not "they forgot to copy it" — it is "they
 * copied it, it was truncated, and nobody found out for a year." So both directions replay
 * the chain through `verifyChain` and refuse on mismatch. Writing a file that cannot be
 * restored is worse than writing no file, because it buys false confidence.
 */

import { deserializeChain, serializeChain, verifyChain } from "../lib/pixel/chain";
import { canvasIdOf } from "../lib/pixel/canvas-id";
import { sha512Hex } from "../lib/pixel/crypto";
import type { PixelChainState } from "../lib/pixel/chain";
import type { NodeIdentity } from "./store";

export const BACKUP_FORMAT = "PIXELNODE1";

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  createdAt: number;
  networkId: number;
  genesisHash: string;
  canvasId: string;
  tipIndex: number;
  tipHash: string;
  pixelCount: number;
  /** True when the sequencer key is inside. Says so loudly because it matters. */
  carriesKey: boolean;
  /** Digest over the serialized chain, so truncation is caught before a replay. */
  chainDigest: string;
}

export interface NodeBackup {
  manifest: BackupManifest;
  chain: unknown;
  /** Present only when the bundle carries the key. */
  identity?: NodeIdentity;
}

export class BackupError extends Error {
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

/**
 * Package a chain — and optionally the key that extends it — after verifying it replays.
 *
 * Verification happens before writing rather than after, so a chain that does not replay
 * never becomes a file somebody trusts.
 */
export async function createBackup(params: {
  chain: PixelChainState;
  identity?: NodeIdentity;
  includeKey?: boolean;
}): Promise<NodeBackup> {
  const { chain, identity, includeKey = false } = params;
  if (chain.pixels.length === 0) {
    throw new BackupError("Refusing to back up an empty chain.", "There is nothing to restore.");
  }

  if (!(await verifyChain(chain))) {
    throw new BackupError(
      "Refusing to back up a chain that does not verify.",
      "A backup nobody can restore is worse than no backup — it buys false confidence.",
    );
  }

  if (includeKey && !identity) {
    throw new BackupError(
      "Asked to include the sequencer key, but this datadir has no nodekey.json.",
      "Drop --include-key to back up the history alone.",
    );
  }

  const serialized = serializeChain(chain);
  const tip = chain.pixels[chain.pixels.length - 1]!;
  const canvas = canvasIdOf(chain);

  return {
    manifest: {
      format: BACKUP_FORMAT,
      createdAt: Date.now(),
      networkId: canvas.networkId,
      genesisHash: canvas.genesisHash,
      canvasId: `${canvas.networkId}:${canvas.genesisHash}`,
      tipIndex: tip.index,
      tipHash: tip.hash,
      pixelCount: chain.pixels.length,
      carriesKey: includeKey,
      chainDigest: await sha512Hex(JSON.stringify(serialized)),
    },
    chain: serialized,
    ...(includeKey && identity ? { identity } : {}),
  };
}

/**
 * Read a bundle back, checking the digest and then replaying every pixel.
 *
 * The digest catches truncation cheaply; the replay is what actually proves the thing is a
 * chain. Both, because a file can be intact and still be nonsense.
 */
export async function readBackup(
  raw: string,
): Promise<{ chain: PixelChainState; manifest: BackupManifest; identity?: NodeIdentity }> {
  let parsed: NodeBackup;
  try {
    parsed = JSON.parse(raw) as NodeBackup;
  } catch {
    throw new BackupError("That file is not a Pixel node backup — it is not even JSON.", "");
  }
  if (parsed?.manifest?.format !== BACKUP_FORMAT) {
    throw new BackupError(
      `Unknown backup format ${String(parsed?.manifest?.format)} (expected ${BACKUP_FORMAT}).`,
      "",
    );
  }

  const digest = await sha512Hex(JSON.stringify(parsed.chain));
  if (digest !== parsed.manifest.chainDigest) {
    throw new BackupError(
      "This backup is damaged: the chain does not match its own digest.",
      "It was probably truncated in transit. Ask for the file again.",
    );
  }

  const chain = deserializeChain(parsed.chain as Parameters<typeof deserializeChain>[0]);
  if (!(await verifyChain(chain))) {
    throw new BackupError(
      "This backup does not replay — every pixel was checked and the chain does not hold.",
      "Do not build on it. Get a copy from someone whose node verifies.",
    );
  }

  const tip = chain.pixels[chain.pixels.length - 1]!;
  if (tip.hash !== parsed.manifest.tipHash || chain.pixels.length !== parsed.manifest.pixelCount) {
    throw new BackupError(
      "This backup's contents disagree with its own manifest.",
      "Treat it as damaged.",
    );
  }

  return { chain, manifest: parsed.manifest, identity: parsed.identity };
}

/** What a human should be told about a bundle, without reading JSON. */
export function describeBackup(m: BackupManifest): string[] {
  return [
    `network      ${m.networkId}`,
    `genesis      ${m.genesisHash.slice(0, 24)}…`,
    `tip          #${m.tipIndex} ${m.tipHash.slice(0, 16)}…`,
    `pixels       ${m.pixelCount}`,
    `sequencer    ${m.carriesKey ? "INCLUDED — this file can extend the chain" : "not included — history only"}`,
    `written      ${new Date(m.createdAt).toISOString()}`,
  ];
}

export function backupThesis(): Record<string, string> {
  return {
    why:
      "One volume holds the only copy of the history and the only key that can extend it. " +
      "The anchors would prove a picture existed; nobody could reconstruct a pixel of it.",
    twoThings:
      "History needs to be everywhere and needs no trust. The sequencer key needs more than " +
      "one copy and fewer than many, and each one is a trust decision. Bundling them forces " +
      "the cautious answer on both, so the key is opt-in and the manifest always says which.",
    verified:
      "Both directions replay the chain, because the failure to guard against is not a " +
      "forgotten copy but a truncated one nobody noticed. A backup nobody can restore is " +
      "worse than none: it buys false confidence.",
    steps:
      "Whether a second copy exists depends on how many steps it takes. Two: one command to " +
      "write the file, one to restore it.",
  };
}

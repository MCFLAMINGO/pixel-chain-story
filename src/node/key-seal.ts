/**
 * The node key, at rest.
 *
 * ## Why this exists
 *
 * The browser wallet has been sealed properly for a while: AES-GCM-256 over PBKDF2 at
 * 210,000 iterations, plaintext seed never resting in storage after forge. The node —
 * the machine that signs *every block on the chain* — wrote its seed and its ML-DSA
 * secret key to `nodekey.json` as plain JSON.
 *
 * That is the weakest link in the system by a wide margin. A phone that loses its seed
 * loses one person's money. A sequencer that loses its seed loses the chain: whoever
 * holds it can produce blocks, and after T1.1 it is the *only* address that can, since
 * membership is a fold seeded with the founder.
 *
 * ## What is sealed, and what is not
 *
 * Only the seed. Everything else in the file — address, public key, label, scheme, OTS
 * leaf cursor — is public by construction and is left readable, because an operator
 * needs to be able to look at a datadir and see whose it is without typing a
 * passphrase.
 *
 * The ML-DSA secret key is not stored at all any more. It is derived from the seed by
 * `generatePixelKeypair`, so writing it down was storing the same secret twice. Less
 * secret material at rest is strictly better, and the second copy bought nothing.
 *
 * ## Why plaintext still works
 *
 * Refusing to start on an unsealed datadir would lock out every existing operator and
 * every CI run, and a security change that strands the person it protects gets reverted.
 * So plaintext keeps working, and instead the node says so — loudly on stdout at every
 * start, and truthfully in `/health` as `keyAtRest`. That mode line is the point: this
 * project's own rule is that a failure which renders as an ordinary state is worse than
 * an error, because the user acts on it. An unsealed key that never mentions itself is
 * exactly that.
 */

import { hexToBytes, bytesToHex } from "../lib/pixel/index";
import {
  unwrapSeedWithPin,
  wrapSeedWithPin,
  type PinWrappedSeed,
} from "../lib/pixel/people-wallet-seal";

/** Minimum operator passphrase length. Longer than a phone PIN, because it is not one. */
export const NODE_PASSPHRASE_MIN_LENGTH = 12;

export const NODE_KEY_ENV = "PIXEL_KEY_PASSPHRASE";

export type KeyAtRest = "sealed" | "plaintext";

/** A `nodekey.json` whose seed is encrypted. Public fields stay readable. */
export interface SealedNodeIdentity {
  v: 2;
  sealedSeed: PinWrappedSeed;
  address: string;
  publicKey: string;
  label: string;
  nextLeaf?: number;
  scheme?: string;
}

export function isSealedIdentity(value: unknown): value is SealedNodeIdentity {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.v === 2 && typeof v.sealedSeed === "object" && v.sealedSeed !== null;
}

/**
 * The passphrase, if the operator supplied one.
 *
 * Read from the environment rather than prompted, because a node starts unattended —
 * on Railway, in CI, from a systemd unit. An interactive prompt would mean a sealed
 * node could not boot without a human, which in practice means nobody seals it.
 */
export function nodePassphrase(): string | null {
  const raw = process.env[NODE_KEY_ENV];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function assertNodePassphrase(passphrase: string): string {
  const p = passphrase.normalize("NFKC").trim();
  if (p.length < NODE_PASSPHRASE_MIN_LENGTH) {
    throw new Error(
      `${NODE_KEY_ENV} must be at least ${NODE_PASSPHRASE_MIN_LENGTH} characters ` +
        `(got ${p.length}). This key signs every block this node produces.`,
    );
  }
  return p;
}

/** Seal a hex seed under the operator passphrase. */
export async function sealNodeSeed(seedHex: string, passphrase: string): Promise<PinWrappedSeed> {
  const p = assertNodePassphrase(passphrase);
  return wrapSeedWithPin(hexToBytes(seedHex), p);
}

/**
 * Open a sealed seed. Throws with a usable message on the wrong passphrase.
 *
 * Deliberately distinguishes "no passphrase given" from "wrong passphrase given": an
 * operator who forgot the environment variable and an operator who mistyped it need
 * different next actions, and collapsing the two into "could not load key" is how
 * people end up re-forging a genesis they did not mean to replace.
 */
export async function openNodeSeed(
  sealed: PinWrappedSeed,
  passphrase: string | null,
): Promise<string> {
  if (!passphrase) {
    throw new Error(
      `This datadir holds a sealed node key but ${NODE_KEY_ENV} is not set. ` +
        `Set it to the passphrase used when sealing; the key is intact.`,
    );
  }
  try {
    const seed = await unwrapSeedWithPin(sealed, assertNodePassphrase(passphrase));
    return bytesToHex(seed);
  } catch (err) {
    // unwrapSeedWithPin already fails closed on AES-GCM auth failure; re-word it for
    // an operator rather than a wallet holder.
    if (err instanceof Error && /at least/.test(err.message)) throw err;
    throw new Error(
      `Wrong ${NODE_KEY_ENV} — the node key stays sealed. Nothing has been damaged; ` +
        `the datadir is fine and the correct passphrase will open it.`,
    );
  }
}

/** The one line a plaintext operator should see at every start. */
export function plaintextKeyWarning(datadir: string): string {
  return (
    `[pixel-ledger] WARNING: node key is PLAINTEXT on disk at ${datadir}/nodekey.json. ` +
    `This key signs every block this node produces. Seal it with: ` +
    `${NODE_KEY_ENV}=<passphrase> bun run pixel -- key seal --datadir ${datadir}`
  );
}

export function keyAtRestThesis(): {
  sealedFields: string[];
  readableFields: string[];
  notStored: string[];
  why: string;
} {
  return {
    sealedFields: ["seed"],
    readableFields: ["address", "publicKey", "label", "scheme", "nextLeaf"],
    notStored: ["secretKey — derived from the seed, so storing it kept the same secret twice"],
    why:
      "The browser wallet was sealed and the node that signs every block was not. After " +
      "T1.1 the founder's key is the only address that may produce on a fresh chain, so " +
      "this file is the chain. Plaintext still loads, but says so on stdout and in /health — " +
      "an unsealed key that never mentions itself is a failure rendering as an ordinary state.",
  };
}

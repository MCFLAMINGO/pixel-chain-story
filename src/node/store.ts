/**
 * Disk persistence for a Pixel L1 datadir.
 */

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  deserializeChain,
  generatePixelKeypair,
  hexToBytes,
  resolveSchemeId,
  OTS_CURSOR_UNKNOWN,
  restoreLightKeypair,
  serializeChain,
  type LightKeypair,
  type PixelChainState,
  type SchemeId,
  type SerializedChain,
} from "../lib/pixel/index";
import {
  isSealedIdentity,
  nodePassphrase,
  openNodeSeed,
  sealNodeSeed,
  type KeyAtRest,
  type SealedNodeIdentity,
} from "./key-seal";

export interface NodeIdentity {
  seed: string;
  address: string;
  publicKey: string;
  label: string;
  /** OTS Merkle leaf cursor — must advance with every signature. */
  nextLeaf?: number;
  /** PIX-HASH-OTS-128 | PIX-ML-DSA-65 */
  scheme?: string;
  /** ML-DSA secret key hex (never gossip). */
  secretKey?: string;
}

export interface PeerBook {
  peers: string[]; // ws://host:port
}

/**
 * Was the seed we just loaded encrypted on disk?
 *
 * Reported by `/health` as `keyAtRest` and printed at every start when plaintext. An
 * unsealed key that never mentions itself is a failure rendering as an ordinary state.
 */
let lastKeyAtRest: KeyAtRest = "plaintext";
export function keyAtRest(): KeyAtRest {
  return lastKeyAtRest;
}

export async function ensureDatadir(datadir: string): Promise<void> {
  await mkdir(datadir, { recursive: true });
  await mkdir(join(datadir, "wallets"), { recursive: true });
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  // Unique tmp — concurrent persist must not share `${path}.tmp` (rename ENOENT race).
  const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}

export async function saveChain(datadir: string, state: PixelChainState): Promise<void> {
  await writeJsonAtomic(join(datadir, "chain.json"), serializeChain(state));
}

export async function loadChain(datadir: string): Promise<PixelChainState | null> {
  try {
    const raw = await readFile(join(datadir, "chain.json"), "utf8");
    return deserializeChain(JSON.parse(raw) as SerializedChain);
  } catch {
    return null;
  }
}

/**
 * Write `nodekey.json`, sealing the seed when a passphrase is configured.
 *
 * Only the seed is encrypted. Address, public key, label, scheme and the OTS cursor stay
 * readable because they are public by construction, and an operator needs to be able to
 * see whose datadir this is without typing a passphrase. The ML-DSA secret key is no
 * longer written at all — it derives from the seed, so storing it kept one secret twice.
 */
export async function saveIdentity(datadir: string, id: NodeIdentity): Promise<void> {
  const passphrase = nodePassphrase();
  if (!passphrase) {
    await writeJsonAtomic(join(datadir, "nodekey.json"), id);
    return;
  }
  const sealed: SealedNodeIdentity = {
    v: 2,
    sealedSeed: await sealNodeSeed(id.seed, passphrase),
    address: id.address,
    publicKey: id.publicKey,
    label: id.label,
    nextLeaf: id.nextLeaf,
    scheme: id.scheme,
  };
  await writeJsonAtomic(join(datadir, "nodekey.json"), sealed);
}

/**
 * Read `nodekey.json` in either form.
 *
 * Legacy plaintext keeps loading, deliberately: refusing to start on an unsealed datadir
 * would lock out every existing operator and every CI run, and a security change that
 * strands the person it protects gets reverted. The mode is recorded instead, and said
 * out loud.
 */
export async function loadIdentity(datadir: string): Promise<NodeIdentity | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(datadir, "nodekey.json"), "utf8"));
  } catch {
    return null;
  }
  if (isSealedIdentity(parsed)) {
    // A wrong or missing passphrase must throw rather than return null: null reads as
    // "there is no key here", and a node that believes that forges a new genesis over
    // a datadir whose key is merely locked.
    const seed = await openNodeSeed(parsed.sealedSeed, nodePassphrase());
    lastKeyAtRest = "sealed";
    return {
      seed,
      address: parsed.address,
      publicKey: parsed.publicKey,
      label: parsed.label,
      nextLeaf: parsed.nextLeaf,
      scheme: parsed.scheme,
    };
  }
  lastKeyAtRest = "plaintext";
  return parsed as NodeIdentity;
}

/** Which form is on disk, without decrypting. For `key seal` and for reporting. */
export async function identityAtRest(datadir: string): Promise<KeyAtRest | null> {
  try {
    const parsed = JSON.parse(await readFile(join(datadir, "nodekey.json"), "utf8"));
    return isSealedIdentity(parsed) ? "sealed" : "plaintext";
  } catch {
    return null;
  }
}

export async function loadOrCreateIdentity(
  datadir: string,
  label = "node",
): Promise<{ identity: NodeIdentity; keypair: LightKeypair }> {
  let identity = await loadIdentity(datadir);
  let keypair: LightKeypair;
  if (identity) {
    const scheme = resolveSchemeId(identity.scheme);
    if (scheme === "PIX-ML-DSA-65") {
      keypair = await generatePixelKeypair("PIX-ML-DSA-65", hexToBytes(identity.seed));
      if (identity.secretKey) keypair.secretKey = identity.secretKey;
    } else {
      keypair = await restoreLightKeypair(
        hexToBytes(identity.seed),
        identity.nextLeaf ?? OTS_CURSOR_UNKNOWN,
      );
    }
  } else {
    const scheme = resolveSchemeId();
    keypair = await generatePixelKeypair(scheme);
    identity = {
      seed: keypair.seed,
      address: keypair.address,
      publicKey: keypair.publicKey,
      label,
      nextLeaf: keypair.nextLeaf,
      scheme: keypair.scheme ?? scheme,
      secretKey: keypair.secretKey,
    };
    await saveIdentity(datadir, identity);
  }
  return { identity, keypair };
}

/** Persist identity including OTS leaf cursor after signing. */
export async function persistIdentityLeaf(
  datadir: string,
  identity: NodeIdentity,
  keypair: LightKeypair,
): Promise<NodeIdentity> {
  const next: NodeIdentity = {
    ...identity,
    nextLeaf: keypair.nextLeaf,
    scheme: keypair.scheme ?? identity.scheme,
    secretKey: keypair.secretKey ?? identity.secretKey,
    publicKey: keypair.publicKey,
    address: keypair.address,
  };
  await saveIdentity(datadir, next);
  return next;
}

export async function saveWallet(
  datadir: string,
  name: string,
  keypair: LightKeypair,
): Promise<void> {
  await writeJsonAtomic(join(datadir, "wallets", `${name}.json`), {
    name,
    seed: keypair.seed,
    address: keypair.address,
    publicKey: keypair.publicKey,
    nextLeaf: keypair.nextLeaf,
    scheme: keypair.scheme ?? "PIX-HASH-OTS-128",
    secretKey: keypair.secretKey,
  });
}

export async function loadWallet(datadir: string, name: string): Promise<LightKeypair | null> {
  try {
    const raw = await readFile(join(datadir, "wallets", `${name}.json`), "utf8");
    const data = JSON.parse(raw) as {
      seed: string;
      nextLeaf?: number;
      scheme?: string;
      secretKey?: string;
    };
    const scheme = resolveSchemeId(data.scheme) as SchemeId;
    if (scheme === "PIX-ML-DSA-65") {
      const kp = await generatePixelKeypair("PIX-ML-DSA-65", hexToBytes(data.seed));
      if (data.secretKey) kp.secretKey = data.secretKey;
      return kp;
    }
    return restoreLightKeypair(hexToBytes(data.seed), data.nextLeaf ?? OTS_CURSOR_UNKNOWN);
  } catch {
    return null;
  }
}

export async function savePeers(datadir: string, peers: string[]): Promise<void> {
  await writeJsonAtomic(join(datadir, "peers.json"), { peers } satisfies PeerBook);
}

export async function loadPeers(datadir: string): Promise<string[]> {
  try {
    const raw = await readFile(join(datadir, "peers.json"), "utf8");
    return (JSON.parse(raw) as PeerBook).peers ?? [];
  } catch {
    return [];
  }
}

/** Consumed ethereum lock digests — prevent double shine-in of the same Locked tx. */
export type BridgeFeederBook = {
  v: 1;
  consumed: string[];
};

export async function saveBridgeFeeder(datadir: string, consumed: Set<string>): Promise<void> {
  const book: BridgeFeederBook = { v: 1, consumed: [...consumed] };
  await writeJsonAtomic(join(datadir, "bridge-feeder.json"), book);
}

export async function loadBridgeFeeder(datadir: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(datadir, "bridge-feeder.json"), "utf8");
    const book = JSON.parse(raw) as BridgeFeederBook;
    return new Set(book.consumed ?? []);
  } catch {
    return new Set();
  }
}

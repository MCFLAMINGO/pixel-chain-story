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
  restoreLightKeypair,
  serializeChain,
  type LightKeypair,
  type PixelChainState,
  type SchemeId,
  type SerializedChain,
} from "../lib/pixel/index";

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

export async function ensureDatadir(datadir: string): Promise<void> {
  await mkdir(datadir, { recursive: true });
  await mkdir(join(datadir, "wallets"), { recursive: true });
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
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

export async function saveIdentity(datadir: string, id: NodeIdentity): Promise<void> {
  await writeJsonAtomic(join(datadir, "nodekey.json"), id);
}

export async function loadIdentity(datadir: string): Promise<NodeIdentity | null> {
  try {
    const raw = await readFile(join(datadir, "nodekey.json"), "utf8");
    return JSON.parse(raw) as NodeIdentity;
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
      keypair = await restoreLightKeypair(hexToBytes(identity.seed), identity.nextLeaf ?? 0);
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
    return restoreLightKeypair(hexToBytes(data.seed), data.nextLeaf ?? 0);
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

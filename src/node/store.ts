/**
 * Disk persistence for a Pixel L1 datadir.
 */

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  deserializeChain,
  hexToBytes,
  restoreLightKeypair,
  serializeChain,
  type LightKeypair,
  type PixelChainState,
  type SerializedChain,
} from "../lib/pixel/index";

export interface NodeIdentity {
  seed: string;
  address: string;
  publicKey: string;
  label: string;
  /** OTS Merkle leaf cursor — must advance with every signature. */
  nextLeaf?: number;
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
    keypair = await restoreLightKeypair(hexToBytes(identity.seed), identity.nextLeaf ?? 0);
  } else {
    const { generateLightKeypair } = await import("../lib/pixel/index");
    keypair = await generateLightKeypair();
    identity = {
      seed: keypair.seed,
      address: keypair.address,
      publicKey: keypair.publicKey,
      label,
      nextLeaf: keypair.nextLeaf,
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
  const next = { ...identity, nextLeaf: keypair.nextLeaf };
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
  });
}

export async function loadWallet(datadir: string, name: string): Promise<LightKeypair | null> {
  try {
    const raw = await readFile(join(datadir, "wallets", `${name}.json`), "utf8");
    const data = JSON.parse(raw) as { seed: string; nextLeaf?: number };
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

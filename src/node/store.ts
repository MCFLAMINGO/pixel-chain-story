/**
 * Disk persistence for a Pixel L1 datadir.
 */

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  deserializeChain,
  generateLightKeypair,
  hexToBytes,
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
    keypair = await generateLightKeypair(hexToBytes(identity.seed));
  } else {
    keypair = await generateLightKeypair();
    identity = {
      seed: keypair.seed,
      address: keypair.address,
      publicKey: keypair.publicKey,
      label,
    };
    await saveIdentity(datadir, identity);
  }
  return { identity, keypair };
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
  });
}

export async function loadWallet(datadir: string, name: string): Promise<LightKeypair | null> {
  try {
    const raw = await readFile(join(datadir, "wallets", `${name}.json`), "utf8");
    const data = JSON.parse(raw) as { seed: string };
    return generateLightKeypair(hexToBytes(data.seed));
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

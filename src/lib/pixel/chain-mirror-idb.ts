/**
 * Where a wallet keeps its copy of the picture.
 *
 * Separate database from the wallet's own store on purpose. The seed and the
 * picture fail differently and should not take each other down: eviction of a
 * 1.4 MB chain copy is likely and survivable, eviction of a seed is neither.
 * Keeping them apart also means a quota failure while syncing can never damage
 * the keys.
 */

import type { LedgerPixel } from "./chain";
import type { MirrorStore } from "./chain-mirror";

export const MIRROR_IDB_NAME = "pixel.chain.mirror";
export const MIRROR_IDB_STORE = "picture";
export const MIRROR_IDB_KEY = "pixels";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(MIRROR_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MIRROR_IDB_STORE)) db.createObjectStore(MIRROR_IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("mirror idb open failed"));
  });
}

/**
 * A copy that can fail without lying about it.
 *
 * `load` returning null means *no copy* — a read that throws rethrows, so the
 * caller can tell "nothing here" from "could not look". That distinction is the
 * one that invited someone to forge a second identity over their first when the
 * wallet store got it wrong.
 */
export function idbMirrorStore(): MirrorStore {
  return {
    async load() {
      const db = await openDb();
      return new Promise<LedgerPixel[] | null>((resolve, reject) => {
        const tx = db.transaction(MIRROR_IDB_STORE, "readonly");
        const req = tx.objectStore(MIRROR_IDB_STORE).get(MIRROR_IDB_KEY);
        req.onsuccess = () => {
          const v = req.result;
          resolve(Array.isArray(v) ? (v as LedgerPixel[]) : null);
        };
        req.onerror = () => reject(req.error);
      });
    },
    async save(pixels) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(MIRROR_IDB_STORE, "readwrite");
        tx.objectStore(MIRROR_IDB_STORE).put(pixels, MIRROR_IDB_KEY);
        tx.oncomplete = () => resolve();
        // Quota is the expected failure here, and it must surface rather than
        // leave the caller believing a copy was kept.
        tx.onerror = () => reject(tx.error ?? new Error("mirror write failed"));
        tx.onabort = () => reject(tx.error ?? new Error("mirror write aborted"));
      });
    },
  };
}

/** Forget the copy. The picture is elsewhere; this only frees the device. */
export async function clearMirror(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MIRROR_IDB_STORE, "readwrite");
    tx.objectStore(MIRROR_IDB_STORE).delete(MIRROR_IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

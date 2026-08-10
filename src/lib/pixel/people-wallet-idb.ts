/**
 * IndexedDB hold for PIN-sealed people wallet (primary).
 * localStorage remains a sync mirror for tests + migration.
 */
export const PEOPLE_WALLET_IDB_NAME = "pixel.people.wallet";
export const PEOPLE_WALLET_IDB_STORE = "hold";
export const PEOPLE_WALLET_IDB_KEY = "blob";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(PEOPLE_WALLET_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PEOPLE_WALLET_IDB_STORE)) {
        db.createObjectStore(PEOPLE_WALLET_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });
}

/**
 * Whether the store held a wallet, held nothing, or could not be read at all.
 *
 * These were previously the same value. A throw — eviction, a locked store,
 * private browsing, a transient failure — returned null, which is also what an
 * empty store returns. The wallet screen then offered to create a new identity
 * over the top of one it had simply failed to look at.
 */
export type WalletReadResult =
  | { status: "found"; raw: string }
  | { status: "empty" }
  | { status: "unreadable"; reason: string };

export async function idbReadResult(): Promise<WalletReadResult> {
  // No IndexedDB on this platform is not a failure to read one — some private
  // modes and non-browser hosts have none at all. There, localStorage is the
  // authority and an absent wallet is genuinely absent.
  if (typeof indexedDB === "undefined") return { status: "empty" };
  try {
    const db = await openDb();
    const raw = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(PEOPLE_WALLET_IDB_STORE, "readonly");
      const req = tx.objectStore(PEOPLE_WALLET_IDB_STORE).get(PEOPLE_WALLET_IDB_KEY);
      req.onsuccess = () => {
        const v = req.result;
        resolve(typeof v === "string" ? v : v == null ? null : JSON.stringify(v));
      };
      req.onerror = () => reject(req.error);
    });
    return raw === null ? { status: "empty" } : { status: "found", raw };
  } catch (e) {
    return { status: "unreadable", reason: e instanceof Error ? e.message : "storage read failed" };
  }
}

/** Back-compat: null for both empty and unreadable. Prefer `idbReadResult`. */
export async function idbReadRaw(): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PEOPLE_WALLET_IDB_STORE, "readonly");
      const req = tx.objectStore(PEOPLE_WALLET_IDB_STORE).get(PEOPLE_WALLET_IDB_KEY);
      req.onsuccess = () => {
        const v = req.result;
        resolve(typeof v === "string" ? v : v == null ? null : JSON.stringify(v));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function idbWriteRaw(json: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PEOPLE_WALLET_IDB_STORE, "readwrite");
    tx.objectStore(PEOPLE_WALLET_IDB_STORE).put(json, PEOPLE_WALLET_IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClear(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PEOPLE_WALLET_IDB_STORE, "readwrite");
      tx.objectStore(PEOPLE_WALLET_IDB_STORE).delete(PEOPLE_WALLET_IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ok */
  }
}

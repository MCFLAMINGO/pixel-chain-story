#!/usr/bin/env bun
/**
 * Wallet export / import — the seed can leave the device it was born in.
 *
 * Until now it could not, which meant the phone *was* the wallet: no second
 * device, no recovery, and the only thing a user could back up was the PIN — the
 * one piece that is worthless alone.
 *
 * What travels is the stored blob, already sealed with the PIN, so the export
 * text unwraps nothing without it. Proves:
 *   1. Export round-trips: the same wallet, same address, unlockable by PIN.
 *   2. The export is sealed — the wrong PIN cannot open it.
 *   3. Importing over a *different* wallet is refused unless asked, because that
 *      wallet's seed may exist nowhere else.
 *   4. Garbage, truncation and a wrong prefix are rejected with a real reason.
 *   5. The OTS leaf cursor travels, so a restored wallet does not reuse leaves.
 */

import {
  exportPeopleWallet,
  forgeAndPersistPeopleWallet,
  importPeopleWallet,
  loadPeopleWalletBlob,
  unlockStoredPeopleWallet,
  PEOPLE_WALLET_EXPORT_MAGIC,
} from "../src/lib/pixel/people-wallet";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

async function expectThrow(fn: () => Promise<unknown>, match: RegExp, label: string) {
  let msg = "";
  try {
    await fn();
  } catch (e) {
    msg = (e as Error).message;
  }
  assert(msg !== "", `${label} must throw`);
  assert(match.test(msg), `${label} — message should match ${match}, got: ${msg}`);
}

// A browser-free localStorage good enough for the wallet's storage calls.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

console.log("═══ WALLET EXPORT / IMPORT ═══\n");

const PIN = "271828";
const forged = await forgeAndPersistPeopleWallet("Chef ErikO", PIN);
const original = forged.payFace.address;
console.log(`▸ forged ${forged.payFace.localId} at ${original.slice(0, 16)}… ✓`);

// 1. Round trip.
const exported = await exportPeopleWallet();
assert(exported, "a stored wallet must export");
assert(exported!.startsWith(`${PEOPLE_WALLET_EXPORT_MAGIC}:`), "export must be self-identifying");

store.clear();
assert(loadPeopleWalletBlob() === null, "storage must be empty before import");

const imported = await importPeopleWallet(exported!);
assert(imported.address === original, "the imported wallet must be the same wallet");
assert(imported.replaced === false, "nothing was replaced on an empty device");

const unlocked = await unlockStoredPeopleWallet(PIN);
assert(unlocked, "the imported wallet must unlock with the original PIN");
assert(unlocked!.payFace.address === original, "unlocked address must match");
console.log("▸ exported, wiped, imported, unlocked with the same PIN — same address ✓");

// 2. Sealed: the text alone is not the wallet.
await expectThrow(
  async () => unlockStoredPeopleWallet("000000"),
  /.+/,
  "the wrong PIN on an imported wallet",
);
assert(!exported!.includes(PIN), "the export must not carry the PIN");
console.log("▸ the export is sealed — the wrong PIN opens nothing ✓");

// 5. The leaf cursor travels, or a restored wallet would reuse one-time leaves.
const blob = loadPeopleWalletBlob();
assert(blob && blob.v === 2, "imported blob must be v2");
assert("nextLeaf" in blob!, "the OTS leaf cursor must travel with the export");
console.log("▸ the OTS leaf cursor travels with the wallet ✓");

// 3. Refuse to silently destroy a different wallet.
store.clear();
const other = await forgeAndPersistPeopleWallet("Someone Else", "314159");
assert(other.payFace.address !== original, "second wallet must be a different address");
await expectThrow(
  async () => importPeopleWallet(exported!),
  /already holds a different wallet/,
  "importing over a different wallet",
);
const forced = await importPeopleWallet(exported!, { replaceDifferent: true });
assert(forced.replaced === true, "an explicit replace must report that it replaced");
assert(forced.address === original, "the forced import must land the exported wallet");
console.log("▸ importing over a different wallet is refused unless asked ✓");

// Re-importing the same wallet is not a replacement, so it needs no confirmation.
const again = await importPeopleWallet(exported!);
assert(again.replaced === false, "re-importing the same wallet is not a replacement");
console.log("▸ re-importing the same wallet needs no confirmation ✓");

// 4. Bad input fails with a reason, never silently.
await expectThrow(async () => importPeopleWallet("hello"), /Not a Pixel wallet export/, "garbage");
await expectThrow(
  async () => importPeopleWallet(exported!.slice(0, exported!.length - 12)),
  /corrupt|not a PIN-sealed/i,
  "a truncated export",
);
await expectThrow(
  async () => importPeopleWallet(`${PEOPLE_WALLET_EXPORT_MAGIC}:${btoa('{"v":1}')}`),
  /not a PIN-sealed wallet/,
  "a legacy blob",
);
console.log("▸ garbage, truncation and legacy blobs are refused with a reason ✓");

console.log(
  "\nwhat this changes: the phone is no longer the wallet. The seed can be moved\n" +
    "and recovered, and the thing a user backs up is finally the thing that matters.",
);
console.log("\n═══ PASS — a wallet can leave the device it was born in ═══");

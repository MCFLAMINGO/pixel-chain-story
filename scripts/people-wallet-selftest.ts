/**
 * People wallet selftest — forge/persist/unlock; pay face never exposes vault cells.
 * bun run test:wallet
 */
import {
  clearPeopleWalletBlob,
  forgeAndPersistPeopleWallet,
  loadPeopleWalletBlob,
  peopleWalletThesis,
  toPayFace,
  unlockStoredPeopleWallet,
} from "../src/lib/pixel/people-wallet";

function mockLocalStorage() {
  const map = new Map<string, string>();
  // @ts-expect-error test shim
  globalThis.localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

async function main() {
  console.log("═══ PEOPLE WALLET ═══\n");
  mockLocalStorage();
  clearPeopleWalletBlob();

  if (!peopleWalletThesis().includes("pay face")) throw new Error("thesis");
  console.log("▸ thesis ✓");

  const { payFace, source } = await forgeAndPersistPeopleWallet("erik");
  if (payFace.address !== source.address) throw new Error("pay face address");
  if ("vault" in payFace) throw new Error("pay face must not carry vault");
  if (!loadPeopleWalletBlob()?.source.vault.cells?.length) {
    throw new Error("vault must persist sealed");
  }
  const faceJson = JSON.stringify(toPayFace(source));
  if (faceJson.includes("cells")) throw new Error("serialized pay face leaked cells");
  console.log("▸ forge + persist; pay face clean ✓", payFace.address.slice(0, 16) + "…");

  const unlocked = await unlockStoredPeopleWallet();
  if (!unlocked || unlocked.unlocked.keypair.address !== payFace.address) {
    throw new Error("unlock mismatch");
  }
  console.log("▸ unlock sealed vault ✓");

  clearPeopleWalletBlob();
  if (loadPeopleWalletBlob()) throw new Error("clear failed");
  console.log("▸ clear device hold ✓");

  console.log("\n═══ PASS — people wallet ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

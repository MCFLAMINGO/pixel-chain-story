/**
 * People wallet selftest — forge/persist/unlock; pay face never exposes vault cells.
 * OTS nextLeaf persists across unlock (PATH Gate H).
 * bun run test:wallet
 */
import { signLightFull } from "../src/lib/pixel/crypto";
import {
  clearPeopleWalletBlob,
  forgeAndPersistPeopleWallet,
  loadPeopleWalletBlob,
  peopleWalletThesis,
  persistPeopleWalletLeaf,
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

  if (!peopleWalletThesis().includes("nextLeaf")) throw new Error("thesis");
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
  if (unlocked.unlocked.keypair.nextLeaf !== 0) throw new Error("fresh nextLeaf");
  console.log("▸ unlock sealed vault ✓");

  // Burn a leaf (as pay would) and persist cursor — re-unlock must restore it.
  await signLightFull("people-wallet-leaf-cursor", unlocked.unlocked.keypair);
  const advanced = unlocked.unlocked.keypair.nextLeaf;
  if (advanced !== 1) throw new Error(`expected nextLeaf 1 got ${advanced}`);
  persistPeopleWalletLeaf(advanced);
  if (loadPeopleWalletBlob()?.nextLeaf !== 1) throw new Error("blob nextLeaf");

  const again = await unlockStoredPeopleWallet();
  if (!again || again.unlocked.keypair.nextLeaf !== 1) {
    throw new Error(
      `leaf cursor lost on unlock: got ${again?.unlocked.keypair.nextLeaf ?? "null"}`,
    );
  }
  console.log("▸ nextLeaf persists across unlock ✓", again.unlocked.keypair.nextLeaf);

  clearPeopleWalletBlob();
  if (loadPeopleWalletBlob()) throw new Error("clear failed");
  console.log("▸ clear device hold ✓");

  console.log("\n═══ PASS — people wallet ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

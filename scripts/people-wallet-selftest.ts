/**
 * People wallet selftest — PIN wrap, pay face clean, OTS nextLeaf across unlock.
 * bun run test:wallet
 */
import { signLightFull, bytesToHex, randomBytes } from "../src/lib/pixel/crypto";
import {
  clearPeopleWalletBlob,
  exportPeopleWalletBackup,
  forgeAndPersistPeopleWallet,
  importPeopleWalletBackup,
  isPinSealedBlob,
  loadPeopleWalletBlob,
  peopleWalletThesis,
  persistPeopleWalletLeaf,
  toPayFace,
  unlockStoredPeopleWallet,
} from "../src/lib/pixel/people-wallet";
import {
  wrapSeedWithPin,
  unwrapSeedWithPin,
  wrapSeedWithRawKey,
  unwrapSeedWithRawKey,
} from "../src/lib/pixel/people-wallet-seal";

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
  console.log("═══ PEOPLE WALLET (PIN) ═══\n");
  mockLocalStorage();
  clearPeopleWalletBlob();

  if (!peopleWalletThesis().includes("PIN-wrapped")) throw new Error("thesis");
  console.log("▸ thesis ✓");

  const seed = randomBytes(32);
  const wrapped = await wrapSeedWithPin(seed, "123456");
  const bad = unwrapSeedWithPin(wrapped, "000000").then(
    () => "ok",
    (e: Error) => e.message,
  );
  if ((await bad) === "ok") throw new Error("wrong PIN must fail");
  const round = await unwrapSeedWithPin(wrapped, "123456");
  if (round.length !== 32) throw new Error("unwrap length");
  console.log("▸ AES-GCM wrap / wrong PIN refuse ✓");

  const { payFace, unlocked } = await forgeAndPersistPeopleWallet("erik", "secret1");
  if (payFace.address !== unlocked.keypair.address) throw new Error("pay face address");
  if ("vault" in payFace) throw new Error("pay face must not carry vault");
  const blob = loadPeopleWalletBlob();
  if (!isPinSealedBlob(blob)) throw new Error("must persist v2 pin seal");
  const raw = JSON.stringify(blob);
  if (raw.includes("cells") || raw.includes("payloadHex")) {
    throw new Error("storage leaked optical vault plaintext");
  }
  if (raw.includes(unlocked.keypair.seed)) throw new Error("storage leaked seed hex");
  const faceJson = JSON.stringify(toPayFace(payFace));
  if (faceJson.includes("cells")) throw new Error("serialized pay face leaked cells");
  console.log("▸ forge + PIN persist; pay face clean ✓", payFace.address.slice(0, 16) + "…");

  try {
    await unlockStoredPeopleWallet("wrong!!");
    throw new Error("bad PIN should throw");
  } catch (e) {
    if (!(e instanceof Error) || !/Wrong PIN|PIN must/i.test(e.message)) {
      throw e;
    }
  }
  console.log("▸ wrong PIN refused ✓");

  const u1 = await unlockStoredPeopleWallet("secret1");
  if (!u1 || u1.unlocked.keypair.address !== payFace.address) throw new Error("unlock mismatch");
  if (u1.unlocked.keypair.nextLeaf !== 0) throw new Error("fresh nextLeaf");
  console.log("▸ PIN unlock ✓");

  await signLightFull("people-wallet-leaf-cursor", u1.unlocked.keypair);
  const advanced = u1.unlocked.keypair.nextLeaf;
  if (advanced !== 1) throw new Error(`expected nextLeaf 1 got ${advanced}`);
  persistPeopleWalletLeaf(advanced);
  if (loadPeopleWalletBlob()?.nextLeaf !== 1) throw new Error("blob nextLeaf");

  const again = await unlockStoredPeopleWallet("secret1");
  if (!again || again.unlocked.keypair.nextLeaf !== 1) {
    throw new Error(
      `leaf cursor lost on unlock: got ${again?.unlocked.keypair.nextLeaf ?? "null"}`,
    );
  }
  console.log("▸ nextLeaf persists across unlock ✓", again.unlocked.keypair.nextLeaf);

  clearPeopleWalletBlob();
  if (loadPeopleWalletBlob()) throw new Error("clear failed");
  console.log("▸ clear device hold ✓");

  // Backup round-trip
  const againForge = await forgeAndPersistPeopleWallet("erik", "backup1");
  const backup = exportPeopleWalletBackup();
  if (!backup.includes("pixelBackup")) throw new Error("backup shape");
  clearPeopleWalletBlob();
  const imported = await importPeopleWalletBackup(backup, "backup1");
  if (imported.address !== againForge.payFace.address) throw new Error("import address");
  const re = await unlockStoredPeopleWallet("backup1");
  if (!re) throw new Error("unlock after import");
  console.log("▸ PIN-sealed backup export/import ✓");

  // Raw key wrap (WebAuthn PRF stand-in)
  const rawKey = randomBytes(32);
  const seed2 = randomBytes(32);
  const rw = await wrapSeedWithRawKey(seed2, rawKey);
  const back = await unwrapSeedWithRawKey(rw, rawKey);
  if (bytesToHex(back) !== bytesToHex(seed2)) throw new Error("raw wrap mismatch");
  console.log("▸ raw-key wrap (PRF path) ✓");

  console.log("\n═══ PASS — people wallet PIN ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

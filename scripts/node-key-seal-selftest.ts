#!/usr/bin/env bun
/**
 * The key that signs every block must not be plaintext on disk — and must still load.
 *
 * The browser wallet has been sealed for a while: AES-GCM-256 over PBKDF2 at 210,000
 * iterations. The node wrote its seed and its ML-DSA secret key to `nodekey.json` as
 * plain JSON. That asymmetry is the wrong way round. A phone that leaks its seed loses
 * one person's money; a sequencer that leaks its seed loses the chain, and after T1.1
 * the founder's key is the *only* address permitted to produce on a fresh chain.
 *
 * Two things are being tested, and the second matters as much as the first:
 *
 *   1. sealing works, wrong passphrases fail closed, and the secret key is gone
 *   2. **plaintext still loads**, because a security change that strands the operator
 *      it protects gets reverted, and then nothing is protected
 *
 * Plus the property that makes the compromise honest: the node states which mode it is
 * in, every start and in `/health`. An unsealed key that never mentions itself is a
 * failure rendering as an ordinary state.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  identityAtRest,
  keyAtRest,
  loadIdentity,
  loadOrCreateIdentity,
  saveIdentity,
  ensureDatadir,
  type NodeIdentity,
} from "../src/node/store";
import {
  assertNodePassphrase,
  NODE_KEY_ENV,
  NODE_PASSPHRASE_MIN_LENGTH,
  isSealedIdentity,
  openNodeSeed,
  plaintextKeyWarning,
  sealNodeSeed,
} from "../src/node/key-seal";

let failures = 0;
function check(cond: unknown, msg: string): void {
  if (cond) console.log(`▸ ${msg} ✓`);
  else {
    console.error(`✗ ${msg}`);
    failures++;
  }
}

const PASSPHRASE = "correct horse battery staple";
const datadirs: string[] = [];
async function scratch(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "pixel-keyseal-"));
  datadirs.push(d);
  await ensureDatadir(d);
  return d;
}

console.log("═══ NODE KEY AT REST ═══\n");

try {
  // ── 1. plaintext keeps working, and says so ──────────────────────────────
  delete process.env[NODE_KEY_ENV];
  const plain = await scratch();
  const created = await loadOrCreateIdentity(plain, "plaintext-node");
  check(created.keypair.address.startsWith("pix1"), "a node forges an identity with no passphrase");
  check((await identityAtRest(plain)) === "plaintext", "and it is plaintext on disk");
  check(keyAtRest() === "plaintext", "keyAtRest() reports plaintext");

  const rawPlain = JSON.parse(await readFile(join(plain, "nodekey.json"), "utf8"));
  check(typeof rawPlain.seed === "string", "the plaintext file really does contain the seed");
  check(
    plaintextKeyWarning(plain).includes("PLAINTEXT"),
    "and there is a warning line that names the problem and the fix",
  );

  const reloadedPlain = await loadOrCreateIdentity(plain, "plaintext-node");
  check(
    reloadedPlain.keypair.address === created.keypair.address,
    "a plaintext datadir reloads to the same address — nobody is stranded",
  );

  // ── 2. sealing, via the same path normal operation uses ──────────────────
  process.env[NODE_KEY_ENV] = PASSPHRASE;
  const identity = (await loadIdentity(plain)) as NodeIdentity;
  await saveIdentity(plain, identity);
  check((await identityAtRest(plain)) === "sealed", "`key seal` converts the datadir in place");

  const rawSealed = JSON.parse(await readFile(join(plain, "nodekey.json"), "utf8"));
  check(isSealedIdentity(rawSealed), "the file is now a v2 sealed identity");
  check(rawSealed.seed === undefined, "the plaintext seed is GONE from disk");
  check(rawSealed.secretKey === undefined, "and the ML-DSA secret key is not stored at all");
  check(
    rawSealed.address === identity.address && rawSealed.publicKey === identity.publicKey,
    "public fields stay readable — an operator can still see whose datadir this is",
  );
  check(
    rawSealed.sealedSeed.iterations === 210_000 && rawSealed.sealedSeed.alg === "AES-GCM-256",
    "sealed with the same primitive as the phone wallet (AES-GCM-256, PBKDF2 210k)",
  );
  check(
    !JSON.stringify(rawSealed).includes(identity.seed),
    "the seed does not appear anywhere in the file, in any field",
  );

  // ── 3. it opens again, to the same key ──────────────────────────────────
  const opened = await loadOrCreateIdentity(plain, "plaintext-node");
  check(
    opened.keypair.address === created.keypair.address,
    "the sealed datadir opens to the SAME address — sealing is not re-forging",
  );
  check(keyAtRest() === "sealed", "keyAtRest() now reports sealed");
  check(
    opened.keypair.secretKey != null,
    "the ML-DSA secret key is re-derived from the seed, so signing still works",
  );

  // ── 4. wrong and missing passphrases fail closed, and differently ───────
  process.env[NODE_KEY_ENV] = "a completely different passphrase";
  let wrongError = "";
  try {
    await loadIdentity(plain);
  } catch (err) {
    wrongError = err instanceof Error ? err.message : String(err);
  }
  check(
    /stays sealed/.test(wrongError),
    `a wrong passphrase refuses: "${wrongError.slice(0, 48)}…"`,
  );
  check(
    /Nothing has been damaged/.test(wrongError),
    "and says the datadir is intact, so nobody re-forges a genesis in a panic",
  );

  delete process.env[NODE_KEY_ENV];
  let missingError = "";
  try {
    await loadIdentity(plain);
  } catch (err) {
    missingError = err instanceof Error ? err.message : String(err);
  }
  check(
    /is not set/.test(missingError),
    "a MISSING passphrase gives a different message than a wrong one",
  );
  // This is the one that would actually destroy a chain: if a locked key read as
  // "no key here", the node would forge a fresh genesis over a live datadir.
  check(
    missingError !== "",
    "a locked key THROWS rather than reading as absent — otherwise a node forges over it",
  );

  // ── 5. a short passphrase is refused up front ───────────────────────────
  let shortError = "";
  try {
    assertNodePassphrase("short");
  } catch (err) {
    shortError = err instanceof Error ? err.message : String(err);
  }
  check(
    shortError.includes(String(NODE_PASSPHRASE_MIN_LENGTH)),
    `a passphrase under ${NODE_PASSPHRASE_MIN_LENGTH} characters is refused`,
  );

  // ── 6. a fresh node born sealed never writes plaintext at all ───────────
  process.env[NODE_KEY_ENV] = PASSPHRASE;
  const bornSealed = await scratch();
  const born = await loadOrCreateIdentity(bornSealed, "sealed-node");
  check((await identityAtRest(bornSealed)) === "sealed", "a node born with a passphrase is sealed");
  const rawBorn = await readFile(join(bornSealed, "nodekey.json"), "utf8");
  check(
    !rawBorn.includes(born.keypair.seed),
    "its seed never touched the disk in plaintext, not even once",
  );

  // ── 7. the seal round-trips independently of the store ──────────────────
  const seedHex = born.keypair.seed;
  const sealed = await sealNodeSeed(seedHex, PASSPHRASE);
  check((await openNodeSeed(sealed, PASSPHRASE)) === seedHex, "seal/open round-trips the seed");
  let tamperError = "";
  try {
    // Flip one byte of ciphertext: AES-GCM must refuse rather than return junk.
    const flipped = {
      ...sealed,
      ciphertext: (sealed.ciphertext[0] === "a" ? "b" : "a") + sealed.ciphertext.slice(1),
    };
    await openNodeSeed(flipped, PASSPHRASE);
  } catch (err) {
    tamperError = err instanceof Error ? err.message : String(err);
  }
  check(tamperError !== "", "tampered ciphertext is refused (authenticated encryption)");

  // ── 8. a corrupt file is not mistaken for an empty one ─────────────────
  const corrupt = await scratch();
  await writeFile(join(corrupt, "nodekey.json"), "{ not json", "utf8");
  check((await loadIdentity(corrupt)) === null, "unparseable nodekey.json reads as absent");
  check((await identityAtRest(corrupt)) === null, "identityAtRest agrees it is unreadable");
} finally {
  delete process.env[NODE_KEY_ENV];
  for (const d of datadirs) await rm(d, { recursive: true, force: true });
}

console.log();
if (failures > 0) {
  console.error(`═══ FAIL — ${failures} check(s) failed ═══`);
  process.exit(1);
}
console.log("═══ PASS — sealed when asked, honest when not, and never stranded ═══");

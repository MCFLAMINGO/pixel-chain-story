#!/usr/bin/env bun
/**
 * One file you can hand to somebody, and proof it restores.
 *
 * The requirement everything is ranked against is "I need to be able to walk away and it
 * works", and one volume currently holds the only copy of the history *and* the only key
 * that can extend it. The anchors would prove a picture existed; nobody could rebuild a
 * pixel of it.
 *
 * Proves:
 *   1. A round trip returns the same chain, tip for tip.
 *   2. History and the key are separable — the default carries no key, so a friend can hold
 *      the whole picture without being handed the ability to write to it.
 *   3. `--include-key` does carry it, and says so in the manifest.
 *   4. A truncated file is refused, because the failure to guard against is a damaged copy
 *      nobody noticed rather than a forgotten one.
 *   5. A file whose contents disagree with its own manifest is refused.
 *   6. An unverifiable chain is never written in the first place.
 */

import { createGenesis, proposeTransfer, sequenceBlock, verifyChain } from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";
import {
  BACKUP_FORMAT,
  BackupError,
  backupThesis,
  createBackup,
  describeBackup,
  readBackup,
} from "../src/node/backup";
import type { NodeIdentity } from "../src/node/store";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

async function refuses(what: string, fn: () => Promise<unknown>, expect: RegExp): Promise<void> {
  try {
    await fn();
  } catch (err) {
    assert(err instanceof BackupError, `${what}: wrong error type (${String(err)})`);
    const e = err as BackupError;
    assert(expect.test(e.message), `${what}: message was "${e.message}"`);
    console.log(`▸ refused ${what} ✓`);
    return;
  }
  console.error(`✗ ${what} was accepted`);
  process.exit(1);
}

console.log("═══ NODE BACKUP ═══\n");

const seq = await generatePixelKeypair("PIX-ML-DSA-65");
const friend = await generatePixelKeypair("PIX-ML-DSA-65");

let chain = await createGenesis(seq);
for (let i = 0; i < 3; i++) {
  const { state } = await proposeTransfer(chain, seq, [{ address: friend.address, amount: 1 }], {
    description: `moment ${i}`,
  });
  chain = await sequenceBlock(state, seq);
}
assert(await verifyChain(chain), "the fixture chain should verify");
const identity: NodeIdentity = {
  seed: "00".repeat(32),
  address: seq.address,
  publicKey: seq.publicKey,
  label: "test-sequencer",
};

// 1. Round trip.
{
  const bundle = await createBackup({ chain, identity });
  const raw = JSON.stringify(bundle);
  const back = await readBackup(raw);
  assert(back.manifest.format === BACKUP_FORMAT, "format tag should survive");
  assert(back.chain.pixels.length === chain.pixels.length, "every pixel should come back");
  const a = chain.pixels[chain.pixels.length - 1]!;
  const b = back.chain.pixels[back.chain.pixels.length - 1]!;
  assert(a.hash === b.hash, "the tip hash must match exactly");
  assert(await verifyChain(back.chain), "and the restored chain must verify on its own");
  console.log(
    `▸ round trip: ${back.chain.pixels.length} pixels, tip #${b.index} ${b.hash.slice(0, 12)}… ` +
      `verifies after restore ✓`,
  );
}

// 2. History and key are separable, and that is the default.
{
  const historyOnly = await createBackup({ chain, identity });
  assert(historyOnly.manifest.carriesKey === false, "the default must not carry the key");
  assert(historyOnly.identity === undefined, "and must not smuggle it in anyway");
  const back = await readBackup(JSON.stringify(historyOnly));
  assert(back.identity === undefined, "a history bundle restores no key");
  assert(back.chain.pixels.length === chain.pixels.length, "but the whole picture is there");
  console.log(
    "▸ history alone by default: a friend can hold the entire picture without being " +
      "handed the ability to write to it ✓",
  );
  assert(
    describeBackup(historyOnly.manifest).some((l) => /history only/.test(l)),
    "and a human is told which kind of file this is",
  );
  console.log("▸ the manifest says which kind of bundle it is, in words ✓");
}

// 3. Opting in carries the key.
{
  const withKey = await createBackup({ chain, identity, includeKey: true });
  assert(withKey.manifest.carriesKey === true, "the manifest must announce the key");
  const back = await readBackup(JSON.stringify(withKey));
  assert(back.identity?.address === seq.address, "the sequencer identity should restore");
  assert(
    describeBackup(withKey.manifest).some((l) => /can extend the chain/.test(l)),
    "and the description must warn what the file can do",
  );
  console.log("▸ --include-key carries the sequencer, and the manifest announces it ✓");

  await refuses(
    "asking for the key when the datadir has none",
    () => createBackup({ chain, includeKey: true }),
    /has no nodekey/,
  );
}

// 4. A damaged file is refused.
{
  const bundle = await createBackup({ chain, identity });
  const damaged = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
  // Lose the last pixel, exactly as a truncated transfer would.
  (damaged.chain as { pixels: unknown[] }).pixels.pop();
  await refuses(
    "a truncated backup, caught by its own digest",
    () => readBackup(JSON.stringify(damaged)),
    /damaged|does not match/,
  );

  await refuses(
    "a file that is not JSON",
    () => readBackup("this is not a backup"),
    /not even JSON/,
  );
  await refuses(
    "an unknown format",
    () => readBackup(JSON.stringify({ manifest: { format: "SOMETHINGELSE" } })),
    /Unknown backup format/,
  );
}

// 5. Contents disagreeing with the manifest are refused.
{
  const bundle = await createBackup({ chain, identity });
  const lying = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
  lying.manifest.tipHash = "f".repeat(128);
  await refuses(
    "a backup whose manifest disagrees with its contents",
    () => readBackup(JSON.stringify(lying)),
    /disagree/,
  );
}

// 6. An unverifiable chain is never written.
{
  const broken = {
    ...chain,
    pixels: chain.pixels.map((p, i) => (i === 2 ? { ...p, hash: "0".repeat(128) } : p)),
  };
  await refuses(
    "backing up a chain that does not verify",
    () => createBackup({ chain: broken, identity }),
    /does not verify/,
  );
  await refuses(
    "backing up an empty chain",
    () => createBackup({ chain: { ...chain, pixels: [] } }),
    /empty/,
  );
}

const t = backupThesis();
for (const [k, v] of Object.entries(t)) console.log(`\n${k}: ${v}`);
console.log("\n═══ PASS — two commands, and the file is proven to restore ═══");

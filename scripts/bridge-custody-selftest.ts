/**
 * Bridge custody inversion — foreign receipt ≠ master PIX release.
 * bun scripts/bridge-custody-selftest.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BRIDGE_CUSTODY_AXIOM,
  BridgeCustodyError,
  LockFeeder,
  One,
  assertVaultReleaseAuthorized,
  balanceOf,
  bridgeThesis,
  createGenesis,
  foreignVerifyIsReceiptOnly,
  forgePersonalSource,
  generateLightKeypair,
  illuminateIngress,
  prepareIngress,
  verifyEvmUlaPackage,
  type EvmOtsSignature,
  type EvmUlaPackage,
  type PreparedIngress,
} from "../src/lib/pixel";

function strip0x(h: string): string {
  return h.replace(/^0x/, "");
}

async function main() {
  console.log("═══ BRIDGE CUSTODY INVERSION ═══\n");
  console.log("law:", BRIDGE_CUSTODY_AXIOM);

  if (One.law.bridgeCustody !== BRIDGE_CUSTODY_AXIOM) {
    throw new Error("One.law.bridgeCustody mismatch");
  }
  const thesis = bridgeThesis();
  if (!thesis.custody.includes("receipts only")) {
    throw new Error("bridgeThesis missing custody inversion");
  }
  const receiptOnly = foreignVerifyIsReceiptOnly();
  if (receiptOnly.releasesMasterPix !== false) {
    throw new Error("foreign verify must not release master PIX");
  }
  console.log("▸ axiom + thesis ✓");

  const you = await forgePersonalSource("vault-you");
  const vault = await generateLightKeypair();
  let state = await createGenesis(vault);
  const before = balanceOf(state, you.source.address);

  // (a) Foreign ULA verify alone — Pixel balances unchanged
  const fixture = JSON.parse(readFileSync(resolve("fixtures/ula-evm-v1.json"), "utf8"));
  const sig: EvmOtsSignature = {
    alg: fixture.signature.alg,
    leafIndex: fixture.signature.leafIndex,
    leafPublicKey: strip0x(fixture.signature.leafPublicKey),
    authPath: fixture.signature.authPath.map(strip0x),
    revealed: fixture.signature.revealed.map(strip0x),
    complements: fixture.signature.complements.map(strip0x),
  };
  const pkg: EvmUlaPackage = {
    version: 1,
    scheme: "PIX-HASH-OTS-128-KECCAK",
    sequence: fixture.sequence,
    prevHash: strip0x(fixture.prevHash),
    beacon: strip0x(fixture.beacon),
    pixelHash: strip0x(fixture.pixelHash),
    merkleRoot: strip0x(fixture.merkleRoot),
    pixelIndex: fixture.pixelIndex,
    messageHash: strip0x(fixture.messageHash),
    sequencerRoot: strip0x(fixture.sequencerRoot),
    message: {
      direction: "shineOut",
      nonce: "1",
      amount: 1,
      asset: "PIX",
      fromAddress: "pix1",
      toChain: "ethereum",
      toAddress: "0x",
    },
    signature: sig,
  };
  const v = verifyEvmUlaPackage(pkg);
  if (!v.ok) throw new Error(`ULA verify should pass: ${v.reason}`);
  const afterVerify = balanceOf(state, you.source.address);
  if (afterVerify !== before) {
    throw new Error("foreign ULA verify alone moved Pixel balance — custody law broken");
  }
  console.log("▸ foreign ULA verify alone → Δbalance=0 ✓");

  // (b) Value release without foreign receipt must fail
  const forgedArtifact = {
    name: "forged",
    kind: "other" as const,
    digest: "aa".repeat(64),
    languages: ["any"],
    originHost: "unknown" as const,
  };
  const forged: PreparedIngress = {
    request: {
      kind: "usd_value",
      name: "forged",
      ownerAddress: you.source.address,
      ownerLocalId: "vault-you",
      // deliberately no valueLock
    },
    artifact: forgedArtifact,
    continuity: {
      artifact: forgedArtifact,
      state: "in_superposition",
      registeredAt: Date.now(),
      note: "forged",
    },
    pixCredit: 5,
    bridgeMessage: {
      direction: "shineIn",
      nonce: "x",
      amount: 5,
      asset: "USDC",
      fromAddress: "fake",
      toChain: "pixel",
      toAddress: you.source.address,
    },
    preparedAt: Date.now(),
  };
  let blocked = false;
  try {
    assertVaultReleaseAuthorized(forged);
  } catch (e) {
    if (e instanceof BridgeCustodyError && e.code === "value_release_without_receipt") {
      blocked = true;
    } else throw e;
  }
  if (!blocked) throw new Error("expected value_release_without_receipt");
  console.log("▸ PIX credit without foreign receipt rejected ✓");

  // (c) Receipt → feed → illuminateIngress → PIX moves (vault path)
  const feeder = LockFeeder.createState();
  const rail = LockFeeder.createRail();
  const eoa = "0xLocker";
  LockFeeder.mintUsdc(rail, eoa, 10);
  const receipt = await LockFeeder.lockUsdc({
    rail,
    locker: eoa,
    humanUsd: 5,
    pixelRecipient: you.source.address,
  });
  const prepared = await LockFeeder.feed({
    receipt,
    ownerLocalId: "vault-you",
    feeder,
    rail,
  });
  assertVaultReleaseAuthorized(prepared);
  const res = await illuminateIngress({
    prepared,
    state,
    bridgeVault: vault,
    sequencer: vault,
  });
  LockFeeder.consume(feeder, receipt.lockDigest);
  state = res.state;
  const after = balanceOf(state, you.source.address);
  if (after !== before + 5) {
    throw new Error(`vault release want ${before + 5} got ${after}`);
  }
  console.log("▸ LockFeeder + illuminateIngress → +5 PIX (vault) ✓");

  // Sanity: prepareIngress without lock still can't forge credit through assert
  const domainPrep = await prepareIngress({
    kind: "domain",
    name: "mcflamingo.com",
    ownerAddress: you.source.address,
    ownerLocalId: "vault-you",
    originUrl: "https://mcflamingo.com",
  });
  if (domainPrep.pixCredit !== 0) throw new Error("domain ingress must not credit PIX");
  assertVaultReleaseAuthorized(domainPrep); // no-op for zero credit
  console.log("▸ domain ingress credits 0 PIX ✓");

  console.log("\n═══ PASS — receipt outside, vault inside ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

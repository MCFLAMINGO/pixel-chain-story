/**
 * Generate fixtures/ula-evm-v1.json — frozen EVM twin ULA vector.
 * Run: bun run scripts/gen-ula-evm-fixture.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  EVM_OTS_ALG,
  generateEvmOtsKeypair,
  verifyEvmOts,
  evmPolsMessage,
  createEvmUlaPackage,
  verifyEvmUlaPackage,
} from "../src/lib/pixel/ula-evm.ts";
import type { UniversalLightAttestation } from "../src/lib/pixel/bridge.ts";
import type { Hex } from "../src/lib/pixel/crypto.ts";

const seed = new Uint8Array(32).fill(7);
const evmKeypair = await generateEvmOtsKeypair(seed);
const beacon = "bb".repeat(32) as Hex;

const messageHash = "cc".repeat(32) as Hex;
const prevHash = "00".repeat(32) as Hex;
const merkleRoot = "aa".repeat(32) as Hex;
const pixelHash = "dd".repeat(32) as Hex;

const att = {
  version: 1 as const,
  source: "pixel-ledger" as const,
  networkId: 1,
  pixelIndex: 1,
  pixelHash,
  prevHash,
  merkleRoot,
  lightProof: {
    sequence: 1,
    sequencerAddress: "pix1fixture",
    sequencerPublicKey: "ee".repeat(32),
    scheme: "PIX-HASH-OTS-128",
    beacon,
    prevHash,
    signature: "00",
    revealedAt: 1_700_000_000,
    skipCount: 0,
  },
  messageHash,
  message: {
    direction: "shineOut" as const,
    nonce: "1",
    amount: 1_000_000,
    asset: "PIX",
    fromAddress: "pix1sender",
    toChain: "ethereum" as const,
    toAddress: "0xReceiver",
  },
  createdAt: 1_700_000_000,
} satisfies UniversalLightAttestation;

const pkg = await createEvmUlaPackage({ att, evmKeypair, beacon });
const check = verifyEvmUlaPackage(pkg);
if (!check.ok) throw new Error(`package verify failed: ${check.reason}`);

const msg = evmPolsMessage({
  sequence: pkg.sequence,
  prevHash: pkg.prevHash,
  beacon: pkg.beacon,
  sequencerRoot: pkg.sequencerRoot,
  messageHash: pkg.messageHash,
});
if (!verifyEvmOts(msg, pkg.signature, pkg.sequencerRoot)) {
  throw new Error("ots self-check failed");
}

const with0x = (h: string) => (h.startsWith("0x") ? h : `0x${h}`);

const fixture = {
  scheme: EVM_OTS_ALG,
  version: 1,
  notes:
    "EVM twin of Pixel ULA. MSG_BITS=32 (first 32 bits of keccak(polsMessage)). Pixel-native OTS remains 128-bit SHA-512. Not production-strength — Gate E bridge proof.",
  seedNote: "deterministic seed = 32 bytes of 0x07",
  sequencerRoot: with0x(pkg.sequencerRoot),
  beacon: with0x(pkg.beacon),
  sequence: pkg.sequence,
  pixelIndex: pkg.pixelIndex,
  prevHash: with0x(pkg.prevHash),
  pixelHash: with0x(pkg.pixelHash),
  merkleRoot: with0x(pkg.merkleRoot),
  messageHash: with0x(pkg.messageHash),
  polsMessage: msg,
  signature: {
    alg: pkg.signature.alg,
    leafIndex: pkg.signature.leafIndex,
    leafPublicKey: with0x(pkg.signature.leafPublicKey),
    authPath: pkg.signature.authPath.map(with0x),
    revealed: pkg.signature.revealed.map(with0x),
    // bare 32 hex chars (16 bytes) — Foundry test parses to bytes16
    complements: pkg.signature.complements.map((c) => c.replace(/^0x/, "")),
  },
};

mkdirSync(resolve("fixtures"), { recursive: true });
const out = resolve("fixtures/ula-evm-v1.json");
writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n");
console.log("wrote", out);
console.log("sequencerRoot", fixture.sequencerRoot);
console.log("leafIndex", fixture.signature.leafIndex);
console.log("revealed", fixture.signature.revealed.length);
console.log("authPath", fixture.signature.authPath.length);

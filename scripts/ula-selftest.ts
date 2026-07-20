/**
 * Gate E — TS + frozen fixture parity for PIX-HASH-OTS-128-KECCAK.
 * bun run scripts/ula-selftest.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EVM_OTS_ALG,
  verifyEvmOts,
  verifyEvmUlaPackage,
  type EvmOtsSignature,
  type EvmUlaPackage,
} from "../src/lib/pixel/ula-evm.ts";

const fixture = JSON.parse(readFileSync(resolve("fixtures/ula-evm-v1.json"), "utf8"));

function strip0x(h: string): string {
  return h.replace(/^0x/, "");
}

const sig: EvmOtsSignature = {
  alg: fixture.signature.alg,
  leafIndex: fixture.signature.leafIndex,
  leafPublicKey: strip0x(fixture.signature.leafPublicKey),
  authPath: fixture.signature.authPath.map(strip0x),
  revealed: fixture.signature.revealed.map(strip0x),
  complements: fixture.signature.complements.map(strip0x),
};

const root = strip0x(fixture.sequencerRoot);
const ok = verifyEvmOts(fixture.polsMessage, sig, root);
if (!ok) throw new Error("TS verifyEvmOts failed on frozen fixture");

const pkg: EvmUlaPackage = {
  version: 1,
  scheme: EVM_OTS_ALG,
  sequence: fixture.sequence,
  prevHash: strip0x(fixture.prevHash),
  beacon: strip0x(fixture.beacon),
  pixelHash: strip0x(fixture.pixelHash),
  merkleRoot: strip0x(fixture.merkleRoot),
  pixelIndex: fixture.pixelIndex,
  messageHash: strip0x(fixture.messageHash),
  sequencerRoot: root,
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
const pack = verifyEvmUlaPackage(pkg);
if (!pack.ok) throw new Error(`verifyEvmUlaPackage: ${pack.reason}`);

console.log("═══ ULA EVM / TS FIXTURE ═══");
console.log("scheme:", fixture.scheme);
console.log("verifyEvmOts: ok");
console.log("verifyEvmUlaPackage: ok");
console.log("IS_STUB equivalent: false (see forge test + CosmWasm twin)");
console.log("OK");

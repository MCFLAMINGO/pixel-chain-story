/**
 * Gate D — frozen public vectors must never drift.
 * bun run test:vectors
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_SCHEME,
  generatePixelKeypair,
  hexToBytes,
  signPixel,
  verifyPixel,
} from "../src/lib/pixel/index";

const VECTORS_PATH = join(import.meta.dir, "../src/lib/pixel/vectors/quantum-v1.json");

async function main() {
  console.log("═══ GATE D — FROZEN QUANTUM VECTORS ═══\n");

  if (DEFAULT_SCHEME !== "PIX-ML-DSA-65") {
    throw new Error(`DEFAULT_SCHEME want PIX-ML-DSA-65 got ${DEFAULT_SCHEME}`);
  }
  console.log("▸ DEFAULT_SCHEME = PIX-ML-DSA-65 ✓");

  // Frozen vectors are known-answer tests; production signing is hedged.
  process.env.PIXEL_DETERMINISTIC_SIG = "1";

  const raw = JSON.parse(readFileSync(VECTORS_PATH, "utf8")) as {
    version: number;
    message: string;
    "PIX-HASH-OTS-128": { signedDigestBits: number; commitmentHalfHexChars: number };
    "PIX-ML-DSA-65": {
      seed: string;
      publicKey: string;
      address: string;
      signature: string;
    };
    "PIX-HASH-OTS-128": {
      seed: string;
      publicKey: string;
      address: string;
      signature: string;
      nextLeafAfterSign: number;
    };
  };
  if (raw.version !== 2)
    throw new Error(`vector version ${raw.version} — expected 2 (PIX-10/16/18)`);
  const msg = raw.message;

  // ML-DSA
  const ml = await generatePixelKeypair("PIX-ML-DSA-65", hexToBytes(raw["PIX-ML-DSA-65"].seed));
  if (ml.publicKey !== raw["PIX-ML-DSA-65"].publicKey) throw new Error("ML-DSA pk drift");
  if (ml.address !== raw["PIX-ML-DSA-65"].address) throw new Error("ML-DSA address drift");
  if (!(await verifyPixel(msg, raw["PIX-ML-DSA-65"].signature, ml.publicKey))) {
    throw new Error("frozen ML-DSA signature failed verify");
  }
  const mlResign = await signPixel(msg, ml);
  if (mlResign !== raw["PIX-ML-DSA-65"].signature) {
    throw new Error("ML-DSA resign not deterministic / vector mismatch");
  }
  console.log("▸ PIX-ML-DSA-65 frozen vectors ✓");

  // OTS
  const ots = await generatePixelKeypair(
    "PIX-HASH-OTS-128",
    hexToBytes(raw["PIX-HASH-OTS-128"].seed),
  );
  if (ots.publicKey !== raw["PIX-HASH-OTS-128"].publicKey) throw new Error("OTS pk drift");
  if (ots.address !== raw["PIX-HASH-OTS-128"].address) throw new Error("OTS address drift");
  if (!(await verifyPixel(msg, raw["PIX-HASH-OTS-128"].signature, ots.publicKey))) {
    throw new Error("frozen OTS signature failed verify");
  }
  const otsResign = await signPixel(msg, ots);
  if (otsResign !== raw["PIX-HASH-OTS-128"].signature) {
    throw new Error("OTS resign mismatch");
  }
  if (ots.nextLeaf !== raw["PIX-HASH-OTS-128"].nextLeafAfterSign) {
    throw new Error("OTS nextLeaf drift");
  }
  // PIX-10: the advertised strength must be in the vector, not just the name.
  const otsVec = raw["PIX-HASH-OTS-128"] as unknown as {
    signedDigestBits: number;
    commitmentHalfHexChars: number;
    signature: string;
  };
  if (otsVec.signedDigestBits < 256) throw new Error("OTS digest under 256 bits");
  if (otsVec.commitmentHalfHexChars !== 64) throw new Error("OTS commitment half truncated");
  const parsedOts = JSON.parse(otsVec.signature) as { revealed: string[]; complements: string[] };
  if (parsedOts.revealed.length !== 256) throw new Error("OTS revealed count");
  if (parsedOts.complements.some((c) => c.length !== 64)) throw new Error("OTS complement width");
  console.log("▸ PIX-HASH-OTS-128 frozen vectors ✓ (256-bit digest, 32-byte halves)");

  // Default birth without args is ML-DSA
  const born = await generatePixelKeypair();
  if (born.scheme !== "PIX-ML-DSA-65") throw new Error("default birth not ML-DSA");
  console.log("▸ generatePixelKeypair() defaults to ML-DSA ✓");

  console.log("\n═══ PASS — Gate D vectors frozen ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

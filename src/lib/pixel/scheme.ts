/**
 * SignatureScheme — crypto-agile post-quantum surface.
 *
 * Quantum security is a first-class product requirement.
 * - PIX-ML-DSA-65: NIST FIPS-204 ML-DSA (Dilithium) — **default birth of a node**
 * - PIX-HASH-OTS-128: hash-based one-time (Merkle window) — constrained / optical
 *
 * Transactions and PoLS sign through `signPixel` / `verifyPixel` so schemes can swap
 * without rewriting the ledger.
 */

import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import {
  addressFromPublicKey,
  bytesToHex,
  generateLightKeypair,
  hexToBytes,
  randomBytes,
  signLightFull,
  verifyLightFull,
  type Hex,
  type LightKeypair,
} from "./crypto";

export type SchemeId = "PIX-HASH-OTS-128" | "PIX-ML-DSA-65";

/**
 * Default for new wallets / nodekeys when PIXEL_SIG_SCHEME unset.
 * Gate D: ML-DSA is normal birth; OTS via PIXEL_SIG_SCHEME=PIX-HASH-OTS-128 or explicit arg.
 */
export const DEFAULT_SCHEME: SchemeId = "PIX-ML-DSA-65";

/** Preferred production scheme (same as default after Gate D). */
export const PREFERRED_PQ_SCHEME: SchemeId = "PIX-ML-DSA-65";

export const SCHEME_INFO: Record<
  SchemeId,
  { family: string; nist: string | null; multiUse: boolean; note: string }
> = {
  "PIX-HASH-OTS-128": {
    family: "hash-based OTS (Lamport + Merkle window)",
    nist: null,
    multiUse: false,
    note: "Quantum-resistant under SHA-512 preimage; each leaf once; constrained / optical paths",
  },
  "PIX-ML-DSA-65": {
    family: "lattice (Dilithium)",
    nist: "FIPS-204 ML-DSA-65",
    multiUse: true,
    note: "NIST-standardized PQ signatures; default for sequencers, wallets, genesis",
  },
};

export function resolveSchemeId(raw?: string | null): SchemeId {
  if (raw === "PIX-ML-DSA-65" || raw === "ml-dsa" || raw === "mldsa") return "PIX-ML-DSA-65";
  if (raw === "PIX-HASH-OTS-128" || raw === "ots") return "PIX-HASH-OTS-128";
  const env = typeof process !== "undefined" ? process.env?.PIXEL_SIG_SCHEME : undefined;
  if (env === "PIX-ML-DSA-65" || env === "ml-dsa") return "PIX-ML-DSA-65";
  if (env === "PIX-HASH-OTS-128" || env === "ots") return "PIX-HASH-OTS-128";
  return DEFAULT_SCHEME;
}

/** Address commitment — OTS keeps legacy `pix-addr|pk`; ML-DSA is scheme-tagged. */
export async function addressForScheme(publicKey: Hex, scheme: SchemeId): Promise<string> {
  if (scheme === "PIX-HASH-OTS-128") {
    return addressFromPublicKey(publicKey);
  }
  const { sha512Hex } = await import("./crypto");
  const digest = await sha512Hex(`pix-addr|${scheme}|${publicKey}`);
  return `pix1${digest.slice(0, 38)}`;
}

export async function generatePixelKeypair(
  scheme: SchemeId = resolveSchemeId(),
  seed?: Uint8Array,
): Promise<LightKeypair> {
  if (scheme === "PIX-HASH-OTS-128") {
    const kp = await generateLightKeypair(seed);
    return { ...kp, scheme };
  }

  const s = seed ?? randomBytes(32);
  const keys = ml_dsa65.keygen(s);
  const publicKey = bytesToHex(keys.publicKey);
  const secretKey = bytesToHex(keys.secretKey);
  const address = await addressForScheme(publicKey, "PIX-ML-DSA-65");
  return {
    scheme: "PIX-ML-DSA-65",
    seed: bytesToHex(s),
    publicKey,
    address,
    secretKey,
    nextLeaf: 0,
    leafCount: 0,
    leafPublicKeys: [],
    privatePairs: [],
  };
}

function domainSeparatedMessage(message: string, scheme: SchemeId): Uint8Array {
  return new TextEncoder().encode(`pix-sig|${scheme}|${message}`);
}

export async function signPixel(message: string, keypair: LightKeypair): Promise<string> {
  const scheme = keypair.scheme ?? "PIX-HASH-OTS-128";
  if (scheme === "PIX-HASH-OTS-128") {
    return signLightFull(message, keypair);
  }
  if (!keypair.secretKey) {
    throw new Error("ML-DSA keypair missing secretKey");
  }
  const msg = domainSeparatedMessage(message, "PIX-ML-DSA-65");
  const sig = ml_dsa65.sign(msg, hexToBytes(keypair.secretKey), { extraEntropy: false });
  return JSON.stringify({
    alg: "PIX-ML-DSA-65",
    sig: bytesToHex(sig),
  });
}

export async function verifyPixel(
  message: string,
  signatureJson: string,
  publicKey: Hex,
): Promise<boolean> {
  try {
    const parsed = JSON.parse(signatureJson) as { alg?: string };
    const alg = parsed.alg;
    if (alg === "PIX-ML-DSA-65") {
      const sig = parsed as { alg: string; sig: string };
      if (!sig.sig) return false;
      const msg = domainSeparatedMessage(message, "PIX-ML-DSA-65");
      return ml_dsa65.verify(hexToBytes(sig.sig), msg, hexToBytes(publicKey));
    }
    if (alg === "PIX-HASH-OTS-128") {
      return verifyLightFull(message, signatureJson, publicKey);
    }
    return false;
  } catch {
    return false;
  }
}

export function schemeFromSignature(signatureJson: string): SchemeId | null {
  try {
    const parsed = JSON.parse(signatureJson) as { alg?: string };
    if (parsed.alg === "PIX-ML-DSA-65" || parsed.alg === "PIX-HASH-OTS-128") {
      return parsed.alg;
    }
    return null;
  } catch {
    return null;
  }
}

export function quantumStatus(): {
  priority: "critical";
  shipped: SchemeId[];
  preferredProduction: SchemeId;
  defaultScheme: SchemeId;
  claim: string;
  gaps: string[];
} {
  return {
    priority: "critical",
    shipped: ["PIX-HASH-OTS-128", "PIX-ML-DSA-65"],
    preferredProduction: PREFERRED_PQ_SCHEME,
    defaultScheme: DEFAULT_SCHEME,
    claim:
      "PQ signatures available now: NIST ML-DSA-65 is the default birth of a node; hash-OTS retained for constrained/optical paths. Classical ECC/ECDSA is not used.",
    gaps: [
      "Full on-chain Dilithium verify deferred (gas); lab uses off-chain ML-DSA + ULAOffchainMldsaGate commit — see docs/ULA-MLDSA.md",
      "External audit pending — docs/AUDIT.md status PREPARING (Gate I)",
      "Gossip default plaintext; opt-in sealed gossip via PIXEL_TRANSPORT_KEM=1 (lab, not TLS)",
    ],
  };
}

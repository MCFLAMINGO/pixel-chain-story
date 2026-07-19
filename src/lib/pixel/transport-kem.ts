/**
 * Lab PQ transport — ML-KEM-768 + XChaCha20-Poly1305.
 *
 * Ledger signatures protect spends. This module protects *channels*
 * (harvest-now-decrypt-later). Default gossip/RPC stay plaintext until
 * an operator opts in; see docs/QUANTUM.md.
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { bytesToHex, hexToBytes, randomBytes, sha512Hex, type Hex } from "./crypto";

export const TRANSPORT_KEM = "PIX-ML-KEM-768" as const;
export const TRANSPORT_AEAD = "XChaCha20-Poly1305" as const;

export interface KemKeypair {
  scheme: typeof TRANSPORT_KEM;
  publicKey: Hex;
  secretKey: Hex;
}

export interface KemEncapsulation {
  ciphertext: Hex;
  sharedSecret: Hex;
}

export interface SealedBox {
  scheme: typeof TRANSPORT_KEM;
  aead: typeof TRANSPORT_AEAD;
  /** ML-KEM ciphertext (encapsulated to recipient) */
  kemCt: Hex;
  nonce: Hex;
  ciphertext: Hex;
}

export function generateKemKeypair(seed?: Uint8Array): KemKeypair {
  const keys = seed
    ? ml_kem768.keygen(seed.length >= 64 ? seed.slice(0, 64) : seed)
    : ml_kem768.keygen();
  return {
    scheme: TRANSPORT_KEM,
    publicKey: bytesToHex(keys.publicKey),
    secretKey: bytesToHex(keys.secretKey),
  };
}

export function encapsulate(recipientPublicKey: Hex): KemEncapsulation {
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(hexToBytes(recipientPublicKey));
  return {
    ciphertext: bytesToHex(cipherText),
    sharedSecret: bytesToHex(sharedSecret),
  };
}

export function decapsulate(kemCiphertext: Hex, recipientSecretKey: Hex): Hex {
  const ss = ml_kem768.decapsulate(hexToBytes(kemCiphertext), hexToBytes(recipientSecretKey));
  return bytesToHex(ss);
}

/** Derive 32-byte AEAD key from KEM shared secret (domain-separated). */
export async function aeadKeyFromShared(sharedSecret: Hex): Promise<Uint8Array> {
  const digest = await sha512Hex(`pix-transport|${TRANSPORT_KEM}|${TRANSPORT_AEAD}|${sharedSecret}`);
  return hexToBytes(digest.slice(0, 64));
}

export async function sealTo(
  recipientPublicKey: Hex,
  plaintext: string | Uint8Array,
): Promise<SealedBox> {
  const enc = encapsulate(recipientPublicKey);
  const key = await aeadKeyFromShared(enc.sharedSecret);
  const nonce = randomBytes(24);
  const pt = typeof plaintext === "string" ? new TextEncoder().encode(plaintext) : plaintext;
  const ct = xchacha20poly1305(key, nonce).encrypt(pt);
  return {
    scheme: TRANSPORT_KEM,
    aead: TRANSPORT_AEAD,
    kemCt: enc.ciphertext,
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ct),
  };
}

export async function openSealed(box: SealedBox, recipientSecretKey: Hex): Promise<Uint8Array> {
  if (box.scheme !== TRANSPORT_KEM || box.aead !== TRANSPORT_AEAD) {
    throw new Error("unsupported transport box");
  }
  const shared = decapsulate(box.kemCt, recipientSecretKey);
  const key = await aeadKeyFromShared(shared);
  return xchacha20poly1305(key, hexToBytes(box.nonce)).decrypt(hexToBytes(box.ciphertext));
}

export async function openSealedText(box: SealedBox, recipientSecretKey: Hex): Promise<string> {
  return new TextDecoder().decode(await openSealed(box, recipientSecretKey));
}

export function transportStatus(): {
  shipped: boolean;
  kem: string;
  aead: string;
  defaultMesh: "plaintext";
  claim: string;
  gaps: string[];
} {
  return {
    shipped: true,
    kem: TRANSPORT_KEM,
    aead: TRANSPORT_AEAD,
    defaultMesh: "plaintext",
    claim:
      "Lab ML-KEM-768 + XChaCha20-Poly1305 session crypto available; gossip/RPC default still plaintext.",
    gaps: [
      "Wire handshake not default-on in gossip-bun / rpc-server",
      "No production TLS/wss replacement claim",
    ],
  };
}

/**
 * Lab PQ transport — ML-KEM-768 + XChaCha20-Poly1305.
 *
 * Ledger signatures protect spends. This module protects *channels*
 * (harvest-now-decrypt-later). Default gossip/RPC stay plaintext until
 * PIXEL_TRANSPORT_KEM=1. See docs/QUANTUM.md.
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { bytesToHex, hexToBytes, randomBytes, type Hex } from "./crypto";

export const TRANSPORT_KEM = "PIX-ML-KEM-768" as const;
export const TRANSPORT_AEAD = "XChaCha20-Poly1305" as const;
export const TRANSPORT_KEM_ENV = "PIXEL_TRANSPORT_KEM" as const;

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

export interface SealedFrame {
  nonce: Hex;
  ciphertext: Hex;
}

/** Opt-in wire encryption. Unset / anything but "1" → plaintext mesh. */
export function transportKemEnabled(): boolean {
  return typeof process !== "undefined" && process.env?.[TRANSPORT_KEM_ENV] === "1";
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

/** Derive 32-byte AEAD key from KEM shared secret (domain-separated, sync). */
export function aeadKeyFromShared(sharedSecret: Hex): Uint8Array {
  const label = new TextEncoder().encode(
    `pix-transport|${TRANSPORT_KEM}|${TRANSPORT_AEAD}|${sharedSecret}`,
  );
  return sha512(label).slice(0, 32);
}

/** Initiator: encapsulate to peer's KEM pk → send kemCt, keep aeadKey. */
export function establishSessionAsInitiator(peerKemPk: Hex): {
  kemCt: Hex;
  aeadKey: Uint8Array;
} {
  const enc = encapsulate(peerKemPk);
  return { kemCt: enc.ciphertext, aeadKey: aeadKeyFromShared(enc.sharedSecret) };
}

/** Responder: decapsulate kemCt with local sk → aeadKey. */
export function establishSessionAsResponder(kemCt: Hex, localSecretKey: Hex): Uint8Array {
  return aeadKeyFromShared(decapsulate(kemCt, localSecretKey));
}

export function sealFrame(aeadKey: Uint8Array, plaintext: string | Uint8Array): SealedFrame {
  const nonce = randomBytes(24);
  const pt = typeof plaintext === "string" ? new TextEncoder().encode(plaintext) : plaintext;
  const ct = xchacha20poly1305(aeadKey, nonce).encrypt(pt);
  return { nonce: bytesToHex(nonce), ciphertext: bytesToHex(ct) };
}

export function openFrame(aeadKey: Uint8Array, nonce: Hex, ciphertext: Hex): Uint8Array {
  return xchacha20poly1305(aeadKey, hexToBytes(nonce)).decrypt(hexToBytes(ciphertext));
}

export function openFrameText(aeadKey: Uint8Array, nonce: Hex, ciphertext: Hex): string {
  return new TextDecoder().decode(openFrame(aeadKey, nonce, ciphertext));
}

/** One-shot seal (KEM per message) — handy for RPC lab clients. */
export function sealTo(recipientPublicKey: Hex, plaintext: string | Uint8Array): SealedBox {
  const enc = encapsulate(recipientPublicKey);
  const key = aeadKeyFromShared(enc.sharedSecret);
  const frame = sealFrame(key, plaintext);
  return {
    scheme: TRANSPORT_KEM,
    aead: TRANSPORT_AEAD,
    kemCt: enc.ciphertext,
    nonce: frame.nonce,
    ciphertext: frame.ciphertext,
  };
}

export function openSealed(box: SealedBox, recipientSecretKey: Hex): Uint8Array {
  if (box.scheme !== TRANSPORT_KEM || box.aead !== TRANSPORT_AEAD) {
    throw new Error("unsupported transport box");
  }
  const key = aeadKeyFromShared(decapsulate(box.kemCt, recipientSecretKey));
  return openFrame(key, box.nonce, box.ciphertext);
}

export function openSealedText(box: SealedBox, recipientSecretKey: Hex): string {
  return new TextDecoder().decode(openSealed(box, recipientSecretKey));
}

export function transportStatus(): {
  shipped: boolean;
  kem: string;
  aead: string;
  defaultMesh: "plaintext";
  optInEnv: typeof TRANSPORT_KEM_ENV;
  wireOptIn: boolean;
  claim: string;
  gaps: string[];
} {
  const wireOptIn = transportKemEnabled();
  return {
    shipped: true,
    kem: TRANSPORT_KEM,
    aead: TRANSPORT_AEAD,
    defaultMesh: "plaintext",
    optInEnv: TRANSPORT_KEM_ENV,
    wireOptIn,
    claim: wireOptIn
      ? "Opt-in lab ML-KEM-768 gossip sessions active (PIXEL_TRANSPORT_KEM=1); not a TLS/wss replacement."
      : "Lab ML-KEM-768 + XChaCha20-Poly1305 available; gossip/RPC default plaintext. Set PIXEL_TRANSPORT_KEM=1 for sealed gossip.",
    gaps: [
      wireOptIn
        ? "Opt-in wire active — still lab; no production TLS/wss claim"
        : "Default mesh plaintext — enable PIXEL_TRANSPORT_KEM=1 for sealed gossip",
      "No production TLS/wss replacement claim",
    ],
  };
}

/**
 * PIN wrap for people wallet seeds — AES-GCM-256 + PBKDF2.
 * Plaintext seed never rests in localStorage after forge.
 */
import { bytesToHex, hexToBytes, randomBytes, type Hex } from "./crypto";

export const PIN_WRAP_ALG = "AES-GCM-256" as const;
export const PIN_PBKDF2_ITERATIONS = 210_000;
export const PIN_MIN_LENGTH = 6;

export type PinWrappedSeed = {
  v: 1;
  alg: typeof PIN_WRAP_ALG;
  salt: Hex;
  iv: Hex;
  ciphertext: Hex;
  iterations: number;
};

export function assertPin(pin: string): string {
  const p = pin.normalize("NFKC").trim();
  if (p.length < PIN_MIN_LENGTH) {
    throw new Error(`PIN must be at least ${PIN_MIN_LENGTH} characters`);
  }
  return p;
}

async function deriveAesKey(pin: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt 32-byte seed under PIN. */
export async function wrapSeedWithPin(seed: Uint8Array, pin: string): Promise<PinWrappedSeed> {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const p = assertPin(pin);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey(p, salt, PIN_PBKDF2_ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, seed));
  return {
    v: 1,
    alg: PIN_WRAP_ALG,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(ct),
    iterations: PIN_PBKDF2_ITERATIONS,
  };
}

/** Decrypt seed; wrong PIN → throws (AES-GCM auth fail). */
export async function unwrapSeedWithPin(wrapped: PinWrappedSeed, pin: string): Promise<Uint8Array> {
  if (wrapped.v !== 1 || wrapped.alg !== PIN_WRAP_ALG) {
    throw new Error("Unsupported wallet seal");
  }
  const p = assertPin(pin);
  const salt = hexToBytes(wrapped.salt);
  const iv = hexToBytes(wrapped.iv);
  const ct = hexToBytes(wrapped.ciphertext);
  const iterations = wrapped.iterations || PIN_PBKDF2_ITERATIONS;
  const key = await deriveAesKey(p, salt, iterations);
  try {
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
    if (pt.length !== 32) throw new Error("bad seed length");
    return pt;
  } catch {
    throw new Error("Wrong PIN — vault stays sealed");
  }
}

export function pinWrapThesis(): string {
  return (
    "Phone vault is PIN-wrapped (AES-GCM + PBKDF2). No free lab unlock on /wallet. " +
    "Spends still use hash-OTS (quantum-leaning one-time leaves)."
  );
}

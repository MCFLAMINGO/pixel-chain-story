/**
 * WebAuthn PRF unlock for people wallet (Face ID / Touch ID when supported).
 * Without PRF, biometrics cannot unwrap the seed — we refuse fake security.
 */
import { bytesToHex, hexToBytes, randomBytes, type Hex } from "./crypto";
import {
  unwrapSeedWithRawKey,
  wrapSeedWithRawKey,
  type RawWrappedSeed,
} from "./people-wallet-seal";

export type WebAuthnSeal = {
  credentialId: Hex;
  wrapped: RawWrappedSeed;
  /** First 32 bytes of PRF salt (stored; second eval input is fixed label). */
  prfSalt: Hex;
};

const PRF_LABEL = new TextEncoder().encode("pixel.people.wallet.prf.v1");

export function webAuthnPrfSupported(): boolean {
  if (typeof window === "undefined" || typeof PublicKeyCredential === "undefined") return false;
  // Feature detect: create() may still fail; we probe getClientCapabilities when present.
  const pkc = PublicKeyCredential as unknown as {
    getClientCapabilities?: () => Promise<Record<string, boolean>>;
  };
  return typeof navigator !== "undefined" && !!navigator.credentials?.create;
}

export async function webAuthnPrfLikely(): Promise<boolean> {
  if (!webAuthnPrfSupported()) return false;
  try {
    const pkc = PublicKeyCredential as unknown as {
      getClientCapabilities?: () => Promise<Record<string, unknown>>;
    };
    if (typeof pkc.getClientCapabilities === "function") {
      const caps = await pkc.getClientCapabilities();
      if (caps.prf === true) return true;
      const ext = caps.extensions;
      if (Array.isArray(ext) && ext.includes("prf")) return true;
    }
  } catch {
    /* fall through */
  }
  return true;
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function prfKeyFromResults(results: unknown): Uint8Array {
  const r = results as { first?: ArrayBuffer; second?: ArrayBuffer };
  const buf = r?.first ?? r?.second;
  if (!buf) throw new Error("WebAuthn PRF unavailable on this device/browser");
  const bytes = new Uint8Array(buf);
  if (bytes.length < 32) throw new Error("PRF output too short");
  return bytes.slice(0, 32);
}

/**
 * Register platform authenticator + wrap seed under PRF output.
 * Caller must already have unwrapped seed via PIN.
 */
export async function enableWebAuthnSeal(params: {
  seed: Uint8Array;
  address: string;
  localId: string;
}): Promise<WebAuthnSeal> {
  if (typeof navigator === "undefined" || !navigator.credentials?.create) {
    throw new Error("WebAuthn not available");
  }
  const userId = randomBytes(16);
  const prfSalt = randomBytes(32);
  const challenge = randomBytes(32);
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: "PIXEL Wallet",
        id: typeof location !== "undefined" ? location.hostname : undefined,
      },
      user: {
        id: userId,
        name: params.localId || params.address.slice(0, 16),
        displayName: "PIXEL pay face",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      extensions: {
        prf: { eval: { first: prfSalt } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("WebAuthn registration cancelled");

  // Some platforms only return PRF on get(); immediately assert.
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: "public-key", id: cred.rawId }],
      userVerification: "required",
      timeout: 60_000,
      extensions: {
        prf: { eval: { first: prfSalt, second: PRF_LABEL } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("WebAuthn assertion cancelled");
  const ext = assertion.getClientExtensionResults() as {
    prf?: { results?: unknown; enabled?: boolean };
  };
  const keyBytes = prfKeyFromResults(ext.prf?.results);
  const wrapped = await wrapSeedWithRawKey(params.seed, keyBytes);
  return {
    credentialId: bytesToHex(new Uint8Array(cred.rawId)),
    wrapped,
    prfSalt: bytesToHex(prfSalt),
  };
}

/** Unlock seed via platform biometric + PRF. */
export async function unlockSeedWithWebAuthn(seal: WebAuthnSeal): Promise<Uint8Array> {
  if (typeof navigator === "undefined" || !navigator.credentials?.get) {
    throw new Error("WebAuthn not available");
  }
  const id = hexToBytes(seal.credentialId);
  const prfSalt = hexToBytes(seal.prfSalt);
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: "public-key", id }],
      userVerification: "required",
      timeout: 60_000,
      extensions: {
        prf: { eval: { first: prfSalt, second: PRF_LABEL } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("WebAuthn cancelled");
  const ext = assertion.getClientExtensionResults() as {
    prf?: { results?: unknown };
  };
  const keyBytes = prfKeyFromResults(ext.prf?.results);
  return unwrapSeedWithRawKey(seal.wrapped, keyBytes);
}

/** Test helper — not for production UI. */
export { b64urlFromBytes, bytesFromB64url, PRF_LABEL };

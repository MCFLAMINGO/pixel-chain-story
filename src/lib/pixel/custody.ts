/**
 * Self-custody — law, not a premium feature.
 *
 * Every person owns their Source. Helpers, SMS bridges, Light Pillars, and
 * co-op desks may *aim* light and *invite* Kindling. They must never hold
 * private key material for the people they serve.
 *
 * Form of custody for non-coders: an optical Personal Source (maze light card)
 * — not a 12-word English seed theater, not a telco account.
 */

import {
  encodeMazeCard,
  simulateCameraCapture,
  verifyCapturedPattern,
  type OpticalPattern,
} from "./optical";
import {
  generateLightKeypair,
  hexToBytes,
  randomBytes,
  type Hex,
  type LightKeypair,
} from "./crypto";

/** Non-negotiable. */
export const SELF_CUSTODY_AXIOM =
  "Every person holds their own Source. No gateway, helper, or pillar may spend for them.";

export type CustodyViolation =
  | "gateway_holds_seed"
  | "helper_signs_for_user"
  | "address_mismatch"
  | "missing_personal_source";

export class CustodyError extends Error {
  constructor(
    public readonly code: CustodyViolation,
    message: string,
  ) {
    super(message);
    this.name = "CustodyError";
  }
}

/** A person's Source sealed in light they can print, show, or keep on a phone. */
export interface PersonalSource {
  address: string;
  publicKey: Hex;
  /** Optical vault — the only backup form we teach people by default */
  vault: OpticalPattern;
  /** Local human label (name / phone) — never the spend authority */
  localId: string;
}

export interface UnlockedSource {
  keypair: LightKeypair;
  localId: string;
}

/**
 * Forge a Personal Source under the person's control.
 * Seed never leaves this function except inside the optical vault payload.
 */
export async function forgePersonalSource(
  localId: string,
  seed?: Uint8Array,
): Promise<{
  source: PersonalSource;
  /** Ephemeral unlock for the forging session — caller must not ship this to a server */
  unlocked: UnlockedSource;
}> {
  const s = seed ?? randomBytes(32);
  const keypair = await generateLightKeypair(s);
  const vault = await encodeMazeCard(s);
  return {
    source: {
      address: keypair.address,
      publicKey: keypair.publicKey,
      vault,
      localId,
    },
    unlocked: { keypair, localId },
  };
}

/** Unlock Source from light capture — person + camera; no custodian password DB. */
export async function unlockPersonalSource(
  source: PersonalSource,
  capturedCells?: number[],
): Promise<UnlockedSource> {
  const cells = capturedCells ?? simulateCameraCapture(source.vault, 0);
  const verified = await verifyCapturedPattern(cells, source.vault.checksum);
  if (!verified.ok || !verified.payload) {
    throw new CustodyError(
      "missing_personal_source",
      "Light vault unreadable — Source stays sealed",
    );
  }
  const keypair = await generateLightKeypair(verified.payload);
  if (keypair.address !== source.address) {
    throw new CustodyError("address_mismatch", "Vault light does not match this Source");
  }
  return { keypair, localId: source.localId };
}

/**
 * Runtime law: the signing key's address must be the person's registered Source.
 * Call before any people-path settle.
 */
export function assertSelfCustody(params: {
  signerAddress: string;
  ownerAddress: string;
  /** If true, caller admits a gateway holds the seed — forbidden */
  gatewayHeldSeed?: boolean;
}): void {
  if (params.gatewayHeldSeed) {
    throw new CustodyError(
      "gateway_holds_seed",
      `${SELF_CUSTODY_AXIOM} Gateway-held seeds are forbidden.`,
    );
  }
  if (params.signerAddress !== params.ownerAddress) {
    throw new CustodyError(
      "helper_signs_for_user",
      `${SELF_CUSTODY_AXIOM} Signer ${params.signerAddress.slice(0, 12)}… is not owner.`,
    );
  }
}

export function seedBytesFromHex(seed: Hex): Uint8Array {
  return hexToBytes(seed);
}

export const Custody = {
  axiom: SELF_CUSTODY_AXIOM,
  forge: forgePersonalSource,
  unlock: unlockPersonalSource,
  assert: assertSelfCustody,
  seedBytes: seedBytesFromHex,
  vaultPayloadHex: (source: PersonalSource) => source.vault.payloadHex,
} as const;

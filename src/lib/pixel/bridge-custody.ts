/**
 * Bridge custody inversion — law, not convention.
 *
 * Foreign chains hold receipts (locks, ULA verify/accept).
 * Pixel holds the vault (escrow + tip-authorized release).
 * Foreign verify alone never releases master PIX.
 *
 * Hypothesis → theory: falsified if any foreign-only verify path
 * can move Pixel balances without illuminateIngress.
 */

import { canonicalizeHex, type Hex } from "./crypto";
import { BOOTSTRAP_INGRESS_PIX_PER_USD } from "./bootstrap";
import type { ForeignValueLock, PreparedIngress } from "./worldlight";

/** Non-negotiable. */
export const BRIDGE_CUSTODY_AXIOM =
  "Foreign chain holds receipts only; Pixel holds the vault; foreign verify alone never releases master PIX.";

export type BridgeCustodyViolation =
  | "foreign_verify_as_spend"
  | "value_release_without_receipt"
  | "value_release_wrong_direction"
  | "value_release_missing_owner"
  | "value_release_unverified_lock"
  | "value_release_amount_unbound"
  | "value_release_replayed"
  | "value_release_over_cap";

export class BridgeCustodyError extends Error {
  constructor(
    public readonly code: BridgeCustodyViolation,
    message: string,
  ) {
    super(message);
    this.name = "BridgeCustodyError";
  }
}

/** A foreign lock whose existence and amount were actually proven. */
export interface VerifiedForeignLock {
  foreignRef: string;
  asset: string;
  /** Amount read from the proof — never from the request. */
  amount: number;
  confirmations: number;
  lockDigest: Hex;
}

/** Persisted set of already-redeemed foreign references. */
export interface ConsumedForeignRefs {
  has: (ref: string) => boolean;
  add: (ref: string) => void;
}

export interface VaultReleasePolicy {
  /**
   * Prove the foreign lock happened. Return null to refuse.
   * Absent ⇒ bootstrap mode, which hard-fails in production.
   */
  verifyLock?: (lock: ForeignValueLock) => VerifiedForeignLock | null;
  consumed?: ConsumedForeignRefs;
  minConfirmations?: number;
  maxReleasePerReceipt?: number;
  expectedCredit?: (amount: number) => number;
  /** Escape hatch for lab/demo rails; ignored when NODE_ENV=production. */
  allowUnverifiedBootstrapLock?: boolean;
}

/** Default per-receipt ceiling for the bootstrap ingress rail. */
export const MAX_BOOTSTRAP_RELEASE_PIX = 25;

const defaultConsumed: Set<string> = new Set();

/** Process-local replay guard — callers should persist their own. */
export function defaultConsumedForeignRefs(): ConsumedForeignRefs {
  return {
    has: (ref) => defaultConsumed.has(ref),
    add: (ref) => void defaultConsumed.add(ref),
  };
}

/** Reset the process-local guard (tests / fresh rails only). */
export function resetConsumedForeignRefs(): void {
  defaultConsumed.clear();
}

function isProduction(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV === "production";
}

function defaultExpectedCredit(amount: number): number {
  return Math.floor(amount * BOOTSTRAP_INGRESS_PIX_PER_USD);
}

/**
 * Value shine-in may credit PIX only when a foreign receipt is bound
 * and Pixel-side release is about to run (this assert is that gate).
 *
 * Presence of two non-empty strings used to be the whole check, so a declared
 * $1 lock with lockDigest="00" released a million PIX, repeatedly (PIX-09).
 */
export function assertVaultReleaseAuthorized(
  prepared: PreparedIngress,
  policy: VaultReleasePolicy = {},
): void {
  if (prepared.pixCredit <= 0) return;

  const lock = prepared.request.valueLock;
  if (!lock?.lockDigest || !lock.foreignRef) {
    throw new BridgeCustodyError(
      "value_release_without_receipt",
      "PIX credit requires a foreign lock receipt (digest + ref); foreign verify is not spend authority",
    );
  }
  if (!prepared.bridgeMessage || prepared.bridgeMessage.direction !== "shineIn") {
    throw new BridgeCustodyError(
      "value_release_wrong_direction",
      "PIX credit release must be a shineIn bridge message authorized on Pixel",
    );
  }
  if (prepared.bridgeMessage.toAddress !== prepared.request.ownerAddress) {
    throw new BridgeCustodyError(
      "value_release_missing_owner",
      "Shine-in credit must land on the owner's Personal Source",
    );
  }
  if (prepared.bridgeMessage.toChain !== "pixel") {
    throw new BridgeCustodyError(
      "value_release_wrong_direction",
      "Master PIX release targets Pixel, not a foreign chain",
    );
  }

  // 1. The lock must be proven, not asserted.
  let verified: VerifiedForeignLock | null = null;
  if (policy.verifyLock) {
    verified = policy.verifyLock(lock);
    if (!verified) {
      throw new BridgeCustodyError(
        "value_release_unverified_lock",
        `Foreign lock ${lock.foreignRef} did not verify against the foreign chain`,
      );
    }
    const minConf = policy.minConfirmations ?? 1;
    if (verified.confirmations < minConf) {
      throw new BridgeCustodyError(
        "value_release_unverified_lock",
        `Foreign lock has ${verified.confirmations} confirmations, need ${minConf}`,
      );
    }
  } else {
    if (isProduction() && !policy.allowUnverifiedBootstrapLock) {
      throw new BridgeCustodyError(
        "value_release_unverified_lock",
        "Production release requires a foreign lock verifier — bootstrap rail is refused",
      );
    }
    // Bootstrap rail: the digest must at least be a full-width commitment, so a
    // hand-typed "00" cannot stand in for a receipt.
    let digest: string;
    try {
      digest = canonicalizeHex(lock.lockDigest);
    } catch {
      throw new BridgeCustodyError(
        "value_release_unverified_lock",
        "Foreign lock digest is not hex",
      );
    }
    // At least a full 32-byte commitment: keccak256 from an EVM lock event and
    // SHA-512 from a wire attestation both qualify; a hand-typed "00" does not.
    if (digest.length < 64) {
      throw new BridgeCustodyError(
        "value_release_unverified_lock",
        `Foreign lock digest must be at least a 32-byte commitment (got ${digest.length} hex chars)`,
      );
    }
    if (lock.foreignRef.trim().length < 8) {
      throw new BridgeCustodyError(
        "value_release_unverified_lock",
        "Foreign reference is too short to identify a lock",
      );
    }
    verified = {
      foreignRef: lock.foreignRef,
      asset: lock.asset,
      amount: lock.amount,
      confirmations: policy.minConfirmations ?? 1,
      lockDigest: digest,
    };
  }

  // 2. Credit must be bound to the proven amount, never to the request.
  const expected = (policy.expectedCredit ?? defaultExpectedCredit)(verified.amount);
  if (prepared.pixCredit !== expected) {
    throw new BridgeCustodyError(
      "value_release_amount_unbound",
      `PIX credit ${prepared.pixCredit} is not the verified lock amount ${verified.amount} (expected ${expected})`,
    );
  }
  if (prepared.bridgeMessage.amount !== prepared.pixCredit) {
    throw new BridgeCustodyError(
      "value_release_amount_unbound",
      "Bridge message amount does not match the credit being released",
    );
  }

  // 3. Bound release size.
  const cap = policy.maxReleasePerReceipt ?? MAX_BOOTSTRAP_RELEASE_PIX;
  if (prepared.pixCredit > cap) {
    throw new BridgeCustodyError(
      "value_release_over_cap",
      `Release ${prepared.pixCredit} PIX exceeds the per-receipt cap of ${cap}`,
    );
  }

  // 4. One receipt, one release. Validation is idempotent; `consumeVaultRelease`
  //    performs the burn so a caller can assert and then release atomically.
  const consumed = policy.consumed ?? defaultConsumedForeignRefs();
  if (consumed.has(vaultReleaseKey(verified))) {
    throw new BridgeCustodyError(
      "value_release_replayed",
      `Foreign reference ${verified.foreignRef} was already redeemed`,
    );
  }
}

/** Replay key for a proven lock. */
export function vaultReleaseKey(
  lock: Pick<VerifiedForeignLock, "asset" | "foreignRef" | "lockDigest">,
): string {
  return `${lock.asset}|${lock.foreignRef}|${canonicalizeHex(lock.lockDigest)}`;
}

/**
 * Burn the foreign reference so it cannot fund a second release.
 * Call immediately after `assertVaultReleaseAuthorized`, before crediting.
 */
export function consumeVaultRelease(
  prepared: PreparedIngress,
  policy: VaultReleasePolicy = {},
): void {
  if (prepared.pixCredit <= 0) return;
  const lock = prepared.request.valueLock;
  if (!lock) return;
  const consumed = policy.consumed ?? defaultConsumedForeignRefs();
  const key = vaultReleaseKey({
    asset: lock.asset,
    foreignRef: lock.foreignRef,
    lockDigest: lock.lockDigest,
  });
  if (consumed.has(key)) {
    throw new BridgeCustodyError(
      "value_release_replayed",
      `Foreign reference ${lock.foreignRef} was already redeemed`,
    );
  }
  consumed.add(key);
}

/**
 * Document + type-level reminder: ULA / foreign accept is receipt verify only.
 * Call sites that move PIX must go through illuminateIngress instead.
 */
export function foreignVerifyIsReceiptOnly(): {
  axiom: typeof BRIDGE_CUSTODY_AXIOM;
  releasesMasterPix: false;
} {
  return { axiom: BRIDGE_CUSTODY_AXIOM, releasesMasterPix: false };
}

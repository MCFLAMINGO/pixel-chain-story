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

import type { PreparedIngress } from "./worldlight";

/** Non-negotiable. */
export const BRIDGE_CUSTODY_AXIOM =
  "Foreign chain holds receipts only; Pixel holds the vault; foreign verify alone never releases master PIX.";

export type BridgeCustodyViolation =
  | "foreign_verify_as_spend"
  | "value_release_without_receipt"
  | "value_release_wrong_direction"
  | "value_release_missing_owner";

export class BridgeCustodyError extends Error {
  constructor(
    public readonly code: BridgeCustodyViolation,
    message: string,
  ) {
    super(message);
    this.name = "BridgeCustodyError";
  }
}

/**
 * Value shine-in may credit PIX only when a foreign receipt is bound
 * and Pixel-side release is about to run (this assert is that gate).
 */
export function assertVaultReleaseAuthorized(prepared: PreparedIngress): void {
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

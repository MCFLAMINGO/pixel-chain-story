/**
 * Agnostic Light Bridge — shine Pixel Ledger proofs onto any protocol.
 *
 * Pixel does not become an Ethereum L2 or a Cosmos zone. It emits
 * Universal Light Attestations (ULAs): compact, hash-based packages any
 * chain can verify with:
 *   1) SHA-512 / hash-OTS verify of the PoLS light proof
 *   2) Merkle inclusion of the bridge message under the pixel’s merkle root
 *
 * Foreign chains implement a thin verifier (Solidity, Move, CosmWasm, Bitcoin
 * script+covenant, etc.). Pixel never depends on their VM.
 *
 * Flows:
 *   shineOut  — lock/escrow PIX on Pixel → attest → mint/unlock on chain X
 *   shineIn   — lock asset on chain X → post commitment → release on Pixel
 *
 * For apps (not just value): see siso.ts — Come Into the Light, any language,
 * no parallel rewrite / second Facebook.
 */

import { sha512Hex, type Hex } from "./crypto";
import type { LightProof } from "./pol";
import type { LedgerPixel } from "./chain";
import { verifyLightProof } from "./pol";
import { merkleRoot } from "./pol";

export type ForeignChain =
  | "ethereum"
  | "bitcoin"
  | "cosmos"
  | "solana"
  | "polkadot"
  | "icp"
  | "other";

export interface BridgeMessage {
  direction: "shineOut" | "shineIn";
  nonce: string;
  amount: number;
  asset: string; // "PIX" or foreign denom
  fromAddress: string;
  toChain: ForeignChain | "pixel";
  toAddress: string;
  memo?: string;
}

export interface UniversalLightAttestation {
  version: 1;
  source: "pixel-ledger";
  networkId: number;
  pixelIndex: number;
  pixelHash: Hex;
  prevHash: Hex;
  merkleRoot: Hex;
  lightProof: LightProof;
  /** Commitment to BridgeMessage */
  messageHash: Hex;
  message: BridgeMessage;
  /** Merkle-friendly leaf = hash(message) — verified against pixel merkle via tx path later */
  createdAt: number;
}

export async function hashBridgeMessage(msg: BridgeMessage): Promise<Hex> {
  return sha512Hex(JSON.stringify(msg));
}

/** Build an attestation anchored to an illuminated pixel. */
export async function createAttestation(params: {
  pixel: LedgerPixel;
  networkId: number;
  message: BridgeMessage;
  sequencerAddresses: string[];
}): Promise<UniversalLightAttestation> {
  const messageHash = await hashBridgeMessage(params.message);
  const expected = await merkleRoot(params.pixel.transactions.map((t) => t.txid));
  if (expected !== params.pixel.merkleRoot) {
    throw new Error("Pixel merkle root inconsistent");
  }
  const elected = params.pixel.lightProof.sequencerAddress;
  if (!(await verifyLightProof(params.pixel.lightProof, elected))) {
    throw new Error("Cannot attest: light proof invalid");
  }
  if (!params.sequencerAddresses.includes(elected)) {
    throw new Error("Sequencer not in known set");
  }

  return {
    version: 1,
    source: "pixel-ledger",
    networkId: params.networkId,
    pixelIndex: params.pixel.index,
    pixelHash: params.pixel.hash,
    prevHash: params.pixel.prevHash,
    merkleRoot: params.pixel.merkleRoot,
    lightProof: params.pixel.lightProof,
    messageHash,
    message: params.message,
    createdAt: Date.now(),
  };
}

/**
 * Verify attestation without Pixel node access — only crypto.
 * Foreign contracts call the equivalent of this function.
 */
export async function verifyAttestation(
  att: UniversalLightAttestation,
  trustedSequencers: string[],
): Promise<{ ok: boolean; reason?: string }> {
  if (att.version !== 1 || att.source !== "pixel-ledger") {
    return { ok: false, reason: "bad attestation envelope" };
  }
  if (!trustedSequencers.includes(att.lightProof.sequencerAddress)) {
    return { ok: false, reason: "sequencer not trusted" };
  }
  if (!(await verifyLightProof(att.lightProof, att.lightProof.sequencerAddress))) {
    return { ok: false, reason: "light proof failed" };
  }
  const mh = await hashBridgeMessage(att.message);
  if (mh !== att.messageHash) {
    return { ok: false, reason: "message hash mismatch" };
  }
  if (att.lightProof.prevHash !== att.prevHash) {
    return { ok: false, reason: "prevHash mismatch" };
  }
  return { ok: true };
}

export function bridgeThesis(): {
  principle: string;
  custody: string;
  shineOut: string;
  shineIn: string;
  targets: ForeignChain[];
  neutrality: string;
  status: string;
} {
  return {
    status:
      "LAB — ULAVerifier.sol verifies PIX-HASH-OTS-128-KECCAK (IS_STUB=false); native ULAs verify ML-DSA off-chain; ULAOffchainMldsaGate commits PQ receipts (not full on-chain Dilithium); CosmWasm twin + frozen fixture; public testnet links still pending (see docs/BRIDGE-STATUS.md, docs/ULA-MLDSA.md).",
    principle:
      "Pixel Ledger shines Universal Light Attestations; every other chain only verifies light — never runs Pixel’s VM.",
    custody:
      "Foreign chain holds receipts only; Pixel holds the vault; foreign verify alone never releases master PIX.",
    shineOut:
      "Lock/escrow PIX on Pixel (vault) → attest → foreign chain verifies ULA receipt → mint/unlock mirror. Master PIX stays under Pixel release rules.",
    shineIn:
      "Lock on foreign chain (receipt) → LockFeeder / commitment → illuminateIngress on Pixel vault → PIX to Personal Source.",
    targets: ["ethereum", "bitcoin", "cosmos", "solana", "polkadot", "icp", "other"],
    neutrality:
      "No privileged hub chain. No parallel-build requirement. Ethereum/Bitcoin/Cosmos/ICP are peers for receipts; Pixel is the vault for master PIX.",
  };
}

/** Encode attestation as portable JSON for any relayer. */
export function encodeAttestation(att: UniversalLightAttestation): string {
  return JSON.stringify(att);
}

export function decodeAttestation(raw: string): UniversalLightAttestation {
  return JSON.parse(raw) as UniversalLightAttestation;
}

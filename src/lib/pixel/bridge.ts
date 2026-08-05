/**
 * Agnostic Light Bridge — shine Pixel Ledger proofs onto any protocol.
 *
 * Pixel does not become an Ethereum L2 or a Cosmos zone. It emits
 * Universal Light Attestations (ULAs): compact, hash-based packages any
 * chain can verify with:
 *   1) SHA-512 / hash-OTS verify of the PoLS light proof
 *   2) Merkle inclusion of the anchor transaction under the pixel's merkle root
 *      (`verifyMerkleProof`, proven by `test:bridge-binding`)
 *   3) Sequencer signature over `bridgePayload(...)`, which commits to
 *      networkId, pixelHash, merkleRoot, anchor txid, messageHash and nonce
 *
 * Step 3 exists because the PoLS message does not carry `messageHash`: without
 * it a genuine light proof could be paired with a rewritten payload (PIX-06).
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

import { sha512Hex, type Hex, type LightKeypair } from "./crypto";
import type { LightProof } from "./pol";
import type { LedgerPixel } from "./chain";
import { merkleProof, merkleRoot, verifyLightProof, verifyMerkleProof } from "./pol";
import { signPixel, verifyPixel } from "./scheme";

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
  /** Commitment to BridgeMessage (SHA-512 of its canonical JSON). */
  messageHash: Hex;
  message: BridgeMessage;
  /** Transaction this bridge message is anchored to (proved under merkleRoot). */
  anchorTxid: string;
  anchorIndex: number;
  anchorPath: Hex[];
  anchorLeafCount: number;
  /**
   * Sequencer signature over `bridgePayload(...)`.
   *
   * The PoLS light proof does NOT commit to messageHash, so without this the
   * payload could be rewritten under a genuine signature (PIX-06).
   */
  bridgeSignature: string;
  createdAt: number;
}

export async function hashBridgeMessage(msg: BridgeMessage): Promise<Hex> {
  return sha512Hex(JSON.stringify(msg));
}

/**
 * Domain-separated payload binding the bridge message to one pixel and one
 * anchor transaction. Length-prefixed so no field can absorb a delimiter.
 */
export function bridgePayload(params: {
  networkId: number;
  pixelIndex: number;
  pixelHash: Hex;
  merkleRoot: Hex;
  anchorTxid: string;
  messageHash: Hex;
  nonce: string;
}): string {
  const parts = [
    String(params.networkId),
    String(params.pixelIndex),
    params.pixelHash,
    params.merkleRoot,
    params.anchorTxid,
    params.messageHash,
    params.nonce,
  ];
  return `pix-bridge|v1|${parts.map((p) => `${p.length}:${p}`).join("|")}`;
}

/** Build an attestation anchored to an illuminated pixel. */
export async function createAttestation(params: {
  pixel: LedgerPixel;
  networkId: number;
  message: BridgeMessage;
  sequencerAddresses: string[];
  /** Key that signs the bridge payload — must be the pixel's sequencer. */
  sequencer: LightKeypair;
  /** Transaction to anchor to (defaults to the pixel's first transaction). */
  anchorTxid?: string;
}): Promise<UniversalLightAttestation> {
  const messageHash = await hashBridgeMessage(params.message);
  const txids = params.pixel.transactions.map((t) => t.txid);
  const expected = await merkleRoot(txids);
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
  if (params.sequencer.address !== elected) {
    throw new Error("Bridge payload must be signed by the pixel's sequencer");
  }
  if (params.sequencer.publicKey !== params.pixel.lightProof.sequencerPublicKey) {
    throw new Error("Sequencer public key does not match the light proof");
  }

  const anchorTxid = params.anchorTxid ?? txids[0];
  const anchorIndex = txids.indexOf(anchorTxid);
  if (anchorIndex < 0) throw new Error("Anchor transaction is not in this pixel");
  const anchorPath = await merkleProof(txids, anchorIndex);

  const bridgeSignature = await signPixel(
    bridgePayload({
      networkId: params.networkId,
      pixelIndex: params.pixel.index,
      pixelHash: params.pixel.hash,
      merkleRoot: params.pixel.merkleRoot,
      anchorTxid,
      messageHash,
      nonce: params.message.nonce,
    }),
    params.sequencer,
  );

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
    anchorTxid,
    anchorIndex,
    anchorPath,
    anchorLeafCount: txids.length,
    bridgeSignature,
    createdAt: Date.now(),
  };
}

/** Replay guard store — callers persist this across restarts. */
export interface ConsumedBridgeMessages {
  has: (key: string) => boolean;
  add: (key: string) => void;
}

/**
 * Verify attestation without Pixel node access — only crypto.
 * Foreign contracts call the equivalent of this function.
 */
export async function verifyAttestation(
  att: UniversalLightAttestation,
  trustedSequencers: string[],
  opts: { consumed?: ConsumedBridgeMessages } = {},
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

  // Inclusion: the anchor transaction is provably under this pixel's root.
  if (!att.anchorTxid || !Array.isArray(att.anchorPath)) {
    return { ok: false, reason: "missing anchor inclusion proof" };
  }
  const included = await verifyMerkleProof({
    leaf: att.anchorTxid,
    index: att.anchorIndex,
    path: att.anchorPath,
    root: att.merkleRoot,
    leafCount: att.anchorLeafCount,
  });
  if (!included) {
    return { ok: false, reason: "anchor transaction not included under merkle root" };
  }

  // Binding: the message itself is signed, not merely carried alongside a proof.
  if (!att.bridgeSignature) {
    return { ok: false, reason: "missing bridge signature" };
  }
  const payload = bridgePayload({
    networkId: att.networkId,
    pixelIndex: att.pixelIndex,
    pixelHash: att.pixelHash,
    merkleRoot: att.merkleRoot,
    anchorTxid: att.anchorTxid,
    messageHash: att.messageHash,
    nonce: att.message.nonce,
  });
  const bound = await verifyPixel(payload, att.bridgeSignature, att.lightProof.sequencerPublicKey);
  if (!bound) {
    return { ok: false, reason: "bridge signature does not cover this message" };
  }

  if (opts.consumed) {
    const key = `${att.networkId}|${att.messageHash}`;
    if (opts.consumed.has(key)) {
      return { ok: false, reason: "bridge message already consumed (replay)" };
    }
    opts.consumed.add(key);
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

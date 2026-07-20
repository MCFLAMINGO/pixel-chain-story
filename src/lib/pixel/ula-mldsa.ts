/**
 * ML-DSA native ULA + EVM twin projection + off-chain gate receipt.
 *
 * Full Dilithium verify on EVM is deferred (gas). This module:
 * 1) Proves Pixel-native ULAs verify under PIX-ML-DSA-65 sequencers
 * 2) Re-projects to keccak-OTS twin for ULAVerifier.sol
 * 3) Builds commit digests for ULAOffchainMldsaGate.sol after local verify
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  createAttestation,
  verifyAttestation,
  type BridgeMessage,
  type UniversalLightAttestation,
} from "./bridge";
import {
  createGenesis,
  proposeTransfer,
  sequenceBlock,
  type LedgerPixel,
  type PixelChainState,
} from "./chain";
import { bytesToHex, hexToBytes, type Hex, type LightKeypair } from "./crypto";
import { generatePixelKeypair } from "./scheme";
import {
  createEvmUlaPackage,
  generateEvmOtsKeypair,
  verifyEvmUlaPackage,
  type EvmUlaPackage,
} from "./ula-evm";

export const ULA_MLDSA_GATE_ALG = "PIX-ML-DSA-65-OFFCHAIN-GATE" as const;

export interface MldsaGateReceipt {
  alg: typeof ULA_MLDSA_GATE_ALG;
  /** keccak256(publicKey bytes) — registered as trusted on-chain */
  mldsaPkHash: Hex;
  messageHash: Hex;
  /** keccak256(signature UTF-8 / hex payload) */
  sigHash: Hex;
  /** keccak256(pk ‖ messageHash ‖ sig) — what the gate stores */
  commit: Hex;
  lightProofSignature: string;
  sequencerPublicKey: Hex;
  sequencerAddress: string;
}

function keccakHex(data: Uint8Array): Hex {
  return bytesToHex(keccak_256(data));
}

/** keccak256(pkBytes) for gate registry. */
export function mldsaPkHash(publicKey: Hex): Hex {
  return keccakHex(hexToBytes(publicKey));
}

/** On-chain commit = keccak256(pk ‖ messageHash ‖ sig bytes). */
export function mldsaGateCommit(params: {
  publicKey: Hex;
  messageHash: Hex;
  signature: string;
}): Hex {
  const pk = hexToBytes(params.publicKey);
  const mh = hexToBytes(params.messageHash.padStart(64, "0").slice(0, 64));
  const sig = new TextEncoder().encode(params.signature);
  const buf = new Uint8Array(pk.length + mh.length + sig.length);
  buf.set(pk, 0);
  buf.set(mh, pk.length);
  buf.set(sig, pk.length + mh.length);
  return keccakHex(buf);
}

export function sigHash(signature: string): Hex {
  return keccakHex(new TextEncoder().encode(signature));
}

/**
 * After verifyAttestation + verifyPixel on the PoLS sig, build a gate receipt.
 * Relayer posts `commit` to ULAOffchainMldsaGate.acceptCommit.
 */
export async function buildMldsaGateReceipt(
  att: UniversalLightAttestation,
): Promise<{ ok: true; receipt: MldsaGateReceipt } | { ok: false; reason: string }> {
  const v = await verifyAttestation(att, [att.lightProof.sequencerAddress]);
  if (!v.ok) return { ok: false, reason: v.reason ?? "attestation failed" };

  const sig = att.lightProof.signature;
  const pk = att.lightProof.sequencerPublicKey;
  let parsed: { alg?: string };
  try {
    parsed = JSON.parse(sig) as { alg?: string };
  } catch {
    return { ok: false, reason: "light proof signature not JSON" };
  }
  if (parsed.alg !== "PIX-ML-DSA-65") {
    return { ok: false, reason: "light proof is not PIX-ML-DSA-65" };
  }

  const receipt: MldsaGateReceipt = {
    alg: ULA_MLDSA_GATE_ALG,
    mldsaPkHash: mldsaPkHash(pk),
    messageHash: att.messageHash,
    sigHash: sigHash(sig),
    commit: mldsaGateCommit({
      publicKey: pk,
      messageHash: att.messageHash,
      signature: sig,
    }),
    lightProofSignature: sig,
    sequencerPublicKey: pk,
    sequencerAddress: att.lightProof.sequencerAddress,
  };
  return { ok: true, receipt };
}

/** Lab helper: ML-DSA genesis → transfer → native ULA. */
export async function labMldsaUlaChain(message?: Partial<BridgeMessage>): Promise<{
  alice: LightKeypair;
  bob: LightKeypair;
  state: PixelChainState;
  tip: LedgerPixel;
  attestation: UniversalLightAttestation;
}> {
  const alice = await generatePixelKeypair("PIX-ML-DSA-65");
  const bob = await generatePixelKeypair("PIX-ML-DSA-65");
  let state = await createGenesis(alice);
  ({ state } = await proposeTransfer(state, alice, [{ amount: 5, address: bob.address }], {
    description: "ula-mldsa-lab",
  }));
  state = await sequenceBlock(state, alice);
  const tip = state.pixels[state.pixels.length - 1]!;

  const attestation = await createAttestation({
    pixel: tip,
    networkId: state.networkId,
    sequencerAddresses: state.sequencers.map((s) => s.address),
    message: {
      direction: "shineOut",
      nonce: "ula-mldsa-1",
      amount: 5,
      asset: "PIX",
      fromAddress: alice.address,
      toChain: "ethereum",
      toAddress: "0xlab",
      memo: "mldsa-native-ula",
      ...message,
    },
  });

  return { alice, bob, state, tip, attestation };
}

/** Native ML-DSA ULA → keccak-OTS EVM twin package. */
export async function projectMldsaUlaToEvmTwin(
  att: UniversalLightAttestation,
  evmSeed?: Uint8Array,
): Promise<{ pkg: EvmUlaPackage; evmRoot: Hex }> {
  const evmKeypair = await generateEvmOtsKeypair(evmSeed);
  const pkg = await createEvmUlaPackage({
    att,
    evmKeypair,
    beacon: att.lightProof.beacon,
  });
  const check = verifyEvmUlaPackage(pkg);
  if (!check.ok) throw new Error(`evm twin: ${check.reason}`);
  return { pkg, evmRoot: evmKeypair.publicKey };
}

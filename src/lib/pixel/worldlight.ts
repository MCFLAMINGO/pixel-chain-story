/**
 * Worldlight — how the real world enters Pixel (not theory slides).
 *
 * Questions this answers:
 *   - How do I get $5 USD onto the ledger?
 *   - How is mcflamingo.com / Facebook-scale app *on* the ledger?
 *   - How is a corporate bank account represented without a custodian bank-app rename?
 *
 * Answers:
 *   VALUE   — foreign lock (USD/USDC/wire) → shineIn attestation → PIX to *your* Personal Source
 *   DOMAIN  — site digest + mirrors come into the light (SISO); no rewrite of the site
 *   TREASURY— bank/ref continuity bound to org owners' Personal Sources; spends still Kindling
 *   APP     — one codebase shines in; AWS may die; mirrors serve (no second Facebook)
 *
 * Self-custody: ingress never takes the user's seed. PIX lands on their address.
 */

import { sha512Hex, type Hex, type LightKeypair } from "./crypto";
import {
  comeTowardLight,
  acceptIntoLight,
  digestBytes,
  type ContinuityRecord,
  type HostOrigin,
  type LightArtifact,
} from "./siso";
import { createAttestation, type BridgeMessage, type ForeignChain } from "./bridge";
import { assertVaultReleaseAuthorized } from "./bridge-custody";
import { proposeTransfer, sequenceBlock, type LedgerPixel, type PixelChainState } from "./chain";
import { BOOTSTRAP_INGRESS_PIX_PER_USD } from "./bootstrap";

export type IngressKind = "usd_value" | "domain" | "treasury" | "application" | "site";

/**
 * @deprecated Use BOOTSTRAP_INGRESS_PIX_PER_USD — bridge quote, NOT a dollar peg / FDV.
 * Never multiply by 21M and call it market cap.
 */
export const DEMO_PIX_PER_USD = BOOTSTRAP_INGRESS_PIX_PER_USD;

export interface ForeignValueLock {
  /** e.g. USD, USDC, EUR */
  asset: string;
  amount: number;
  /** Where it is locked today: ethereum USDC, bank wire ref, etc. */
  venue: ForeignChain | "bank_wire" | "other";
  /** Opaque foreign proof / txid / wire reference — hashed, not trusted as text alone */
  foreignRef: string;
  /** Attested lock digest — in production from foreign verifier */
  lockDigest: Hex;
}

export interface IngressRequest {
  kind: IngressKind;
  /** Human name: "$5 USD", "mcflamingo.com", "McFlamingo Corp Treasury" */
  name: string;
  /** Controller — must be their Personal Source address for value credit */
  ownerAddress: string;
  ownerLocalId: string;
  /** Value path */
  valueLock?: ForeignValueLock;
  /** Domain / app / site */
  originUrl?: string;
  originHost?: HostOrigin;
  languages?: string[];
  mirrors?: string[];
  /** Treasury external ref (IBAN hash, account digest) — never raw secrets */
  treasuryRef?: string;
}

export interface PreparedIngress {
  request: IngressRequest;
  artifact: LightArtifact;
  continuity: ContinuityRecord;
  /** PIX to credit if value path (0 otherwise) */
  pixCredit: number;
  bridgeMessage?: BridgeMessage;
  preparedAt: number;
}

export interface IlluminatedIngress {
  continuity: ContinuityRecord;
  state: PixelChainState;
  pixCredited: number;
  summary: string;
  attestationJson?: string;
}

function kindToArtifactKind(kind: IngressKind): LightArtifact["kind"] {
  if (kind === "application") return "other";
  if (kind === "domain" || kind === "site") return "static_site";
  if (kind === "treasury") return "other";
  return "other";
}

/** Hash a foreign value lock into a stable digest. */
export async function digestForeignLock(lock: ForeignValueLock): Promise<Hex> {
  return sha512Hex(
    `lock|${lock.asset}|${lock.amount}|${lock.venue}|${lock.foreignRef}|${lock.lockDigest}`,
  );
}

/**
 * Prepare any world thing to stand at the door of the light.
 * Does not move PIX yet — that happens on illuminate with a funded bridge vault.
 */
export async function prepareIngress(req: IngressRequest): Promise<PreparedIngress> {
  if (!req.ownerAddress.startsWith("pix1")) {
    throw new Error("Ingress owner must be a Personal Source address (self-custody)");
  }

  let pixCredit = 0;
  let bridgeMessage: BridgeMessage | undefined;
  let digestSeed = req.originUrl || req.treasuryRef || req.name;

  if (req.kind === "usd_value") {
    if (!req.valueLock || req.valueLock.amount <= 0) {
      throw new Error("$ ingress needs a foreign value lock (USD/USDC/wire)");
    }
    if (req.valueLock.asset !== "USD" && req.valueLock.asset !== "USDC") {
      throw new Error("Demo value ingress expects USD or USDC lock");
    }
    const lockDigest = await digestForeignLock(req.valueLock);
    digestSeed = lockDigest;
    pixCredit = Math.floor(req.valueLock.amount * BOOTSTRAP_INGRESS_PIX_PER_USD);
    bridgeMessage = {
      direction: "shineIn",
      nonce: `wl-${Date.now()}`,
      amount: pixCredit,
      asset: req.valueLock.asset,
      fromAddress: req.valueLock.foreignRef,
      toChain: "pixel",
      toAddress: req.ownerAddress,
      memo: `Worldlight ${req.valueLock.amount} ${req.valueLock.asset} → ${pixCredit} PIX`,
    };
  } else if (req.kind === "domain" || req.kind === "site") {
    if (!req.originUrl) throw new Error("Domain/site ingress needs originUrl");
    digestSeed = await digestBytes(`domain|${req.originUrl}|${req.ownerAddress}`);
  } else if (req.kind === "treasury") {
    if (!req.treasuryRef) throw new Error("Treasury ingress needs treasuryRef digest");
    digestSeed = await digestBytes(`treasury|${req.treasuryRef}|${req.ownerAddress}`);
  } else if (req.kind === "application") {
    if (!req.originUrl) throw new Error("Application ingress needs originUrl");
    digestSeed = await digestBytes(
      `app|${req.originUrl}|${(req.languages ?? []).join(",")}|${req.ownerAddress}`,
    );
  }

  const digest =
    typeof digestSeed === "string" && digestSeed.length === 128
      ? (digestSeed as Hex)
      : await digestBytes(String(digestSeed));

  const artifact: LightArtifact = {
    name: req.name,
    kind: kindToArtifactKind(req.kind),
    digest,
    languages: req.languages ?? ["any"],
    originHost: req.originHost ?? "unknown",
    originUrl: req.originUrl,
    mirrors: req.mirrors,
  };

  const continuity = await comeTowardLight(artifact);
  continuity.note =
    req.kind === "usd_value"
      ? `Value shine-in prepared: ${pixCredit} PIX → ${req.ownerLocalId} (self-custody)`
      : `${req.kind} standing in superposition — no parallel rewrite`;

  return {
    request: req,
    artifact,
    continuity,
    pixCredit,
    bridgeMessage,
    preparedAt: Date.now(),
  };
}

/**
 * Illuminate ingress:
 * - Always: continuity → in_the_light on a new pixel
 * - Value: bridge vault (protocol escrow) sends PIX to owner's Personal Source
 *
 * `bridgeVault` signs the release — it is escrow, not the user's custodian.
 * User keys never enter this function.
 */
export async function illuminateIngress(params: {
  prepared: PreparedIngress;
  state: PixelChainState;
  /** Escrow key that holds PIX for shine-in releases */
  bridgeVault: LightKeypair;
  sequencer: LightKeypair;
}): Promise<IlluminatedIngress> {
  const { prepared } = params;
  let state = params.state;

  // Custody inversion: foreign receipt bound + Pixel vault release only.
  assertVaultReleaseAuthorized(prepared);

  let pixCredited = 0;
  if (prepared.pixCredit > 0 && prepared.bridgeMessage) {
    // Bridge vault is protocol escrow (signs release). User seed never enters.
    if (prepared.bridgeMessage.toAddress !== prepared.request.ownerAddress) {
      throw new Error("Shine-in credit must land on the owner's Personal Source");
    }
    const spoken = await proposeTransfer(
      state,
      params.bridgeVault,
      [{ address: prepared.request.ownerAddress, amount: prepared.pixCredit }],
      {
        description: prepared.bridgeMessage.memo || "Worldlight shineIn",
        recipientLabel: prepared.request.ownerLocalId,
        reference: `SHINEIN-${prepared.bridgeMessage.nonce}`,
      },
    );
    state = spoken.state;
    pixCredited = prepared.pixCredit;
  } else {
    // Domain / treasury / app — anchor continuity in a pixel (vault self-memo; not user custody)
    const spoken = await proposeTransfer(
      state,
      params.bridgeVault,
      [{ address: params.bridgeVault.address, amount: 1 }],
      {
        description: `Worldlight register: ${prepared.artifact.name}`,
        recipientLabel: prepared.request.ownerLocalId,
        reference: `WLREG-${(prepared.continuity.commitment ?? prepared.artifact.digest).slice(0, 20)}`,
      },
    );
    state = spoken.state;
  }

  state = await sequenceBlock(state, params.sequencer);
  const tip = state.pixels[state.pixels.length - 1];
  const continuity = acceptIntoLight(prepared.continuity, tip.index);

  let attestationJson: string | undefined;
  if (prepared.bridgeMessage) {
    const att = await createAttestation({
      pixel: tip,
      networkId: state.networkId,
      message: prepared.bridgeMessage,
      sequencerAddresses: state.sequencers.map((s) => s.address),
    });
    attestationJson = JSON.stringify(att);
  }

  const summary =
    prepared.request.kind === "usd_value"
      ? `Shone in $${prepared.request.valueLock?.amount} → ${pixCredited} PIX to ${prepared.request.ownerLocalId} (self-custody). ${prepared.request.name} is in the light.`
      : `${prepared.request.name} (${prepared.request.kind}) is in the light at pixel #${tip.index}. Origin may die; mirrors hold.`;

  return { continuity, state, pixCredited, summary, attestationJson };
}

/** Presets people actually ask for. */
export async function ingressUsd(
  amountUsd: number,
  owner: { address: string; localId: string },
  foreignRef: string,
): Promise<PreparedIngress> {
  const lockDigest = await sha512Hex(`demo-lock|USD|${amountUsd}|${foreignRef}`);
  return prepareIngress({
    kind: "usd_value",
    name: `$${amountUsd} USD`,
    ownerAddress: owner.address,
    ownerLocalId: owner.localId,
    valueLock: {
      asset: "USD",
      amount: amountUsd,
      venue: "bank_wire",
      foreignRef,
      lockDigest,
    },
  });
}

export async function ingressDomain(
  url: string,
  owner: { address: string; localId: string },
  mirrors?: string[],
): Promise<PreparedIngress> {
  return prepareIngress({
    kind: "domain",
    name: url.replace(/^https?:\/\//, ""),
    ownerAddress: owner.address,
    ownerLocalId: owner.localId,
    originUrl: url,
    originHost: "unknown",
    languages: ["typescript", "html"],
    mirrors: mirrors ?? [`ipfs://pending-${url}`],
  });
}

export async function ingressTreasury(
  orgName: string,
  treasuryRef: string,
  owner: { address: string; localId: string },
): Promise<PreparedIngress> {
  return prepareIngress({
    kind: "treasury",
    name: orgName,
    ownerAddress: owner.address,
    ownerLocalId: owner.localId,
    treasuryRef,
    mirrors: [`treasury-mirror://${treasuryRef.slice(0, 16)}`],
  });
}

export async function ingressApplication(
  name: string,
  originUrl: string,
  owner: { address: string; localId: string },
  languages: string[],
  mirrors: string[],
): Promise<PreparedIngress> {
  return prepareIngress({
    kind: "application",
    name,
    ownerAddress: owner.address,
    ownerLocalId: owner.localId,
    originUrl,
    originHost: "aws",
    languages,
    mirrors,
  });
}

export function worldlightThesis(): {
  usd: string;
  domain: string;
  treasury: string;
  facebook: string;
  custody: string;
} {
  return {
    usd: "LockFeeder: USDC rail / PixelUsdcLock or bank-wire attestation → verified receipt → shineIn → PIX on your Personal Source.",
    domain:
      "mcflamingo.com shines in as a domain artifact (digest + mirrors). The site keeps running where it runs; Pixel holds continuity if the host dies.",
    treasury:
      "Corporate bank account becomes a treasury continuity record bound to owners' Personal Sources. Spending still requires Kindling — not a bank login rename.",
    facebook:
      "One Facebook/McFlamingo app codebase. Shine in digest + mirrors (SISO). No rewrite for a Pixel VM. No second Facebook.",
    custody: "Ingress never custodies user seeds. Value lands on pix1… you unlock.",
  };
}

export const Worldlight = {
  prepare: prepareIngress,
  illuminate: illuminateIngress,
  usd: ingressUsd,
  domain: ingressDomain,
  treasury: ingressTreasury,
  application: ingressApplication,
  thesis: worldlightThesis,
  demoPixPerUsd: DEMO_PIX_PER_USD,
  ingressPixPerUsd: BOOTSTRAP_INGRESS_PIX_PER_USD,
} as const;

/** Tip pixel helper for callers */
export function tipPixel(state: PixelChainState): LedgerPixel {
  return state.pixels[state.pixels.length - 1];
}

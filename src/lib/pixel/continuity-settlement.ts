/**
 * Continuity settlement on Pixel — booth checkout + till UTXOs.
 *
 * Real chain mutations (proposeTransfer + sequenceBlock).
 * Does not claim DNS/Popmenu hosting takeover.
 */

import {
  balanceOf,
  createGenesis,
  deserializeChain,
  proposeTransfer,
  sequenceBlock,
  serializeChain,
  verifyChain,
  type PixelChainState,
  type SerializedChain,
} from "./chain";
import { restoreLightKeypair, type Hex, type LightKeypair, type LightSchemeId } from "./crypto";
import { generatePixelKeypair } from "./scheme";
import {
  type ContinuityOpsState,
  type ContinuityStore,
  patchStore,
  tillFeePix,
  tillIsActive,
} from "./continuity-ops";
import { assertSameCanvas, canvasIdOf, formatCanvasId, type CanvasId } from "./canvas-id";
import {
  settlementHonesty,
  tipMarkFromState,
  type SettlementPlane,
  type TipMarkReceipt,
} from "./tip-mark";

export const CONTINUITY_CHAIN_KEY = "pixel.continuity.chain.v1";

export interface ContinuityWalletBlob {
  seed: Hex;
  nextLeaf: number;
  address: string;
  scheme?: LightSchemeId;
}

export interface ContinuitySessionBlob {
  networkId: number;
  /** Genesis hash — canvas instance this booth settles on */
  genesisHash?: Hex;
  chainJson: SerializedChain;
  sequencer: ContinuityWalletBlob;
  merchant: ContinuityWalletBlob;
  till: ContinuityWalletBlob;
  storeId: string;
  domain: string;
}

export interface ContinuitySession {
  chain: PixelChainState;
  sequencer: LightKeypair;
  merchant: LightKeypair;
  till: LightKeypair;
  storeId: string;
  domain: string;
}

async function walletBlob(kp: LightKeypair): Promise<ContinuityWalletBlob> {
  if (!kp.seed) throw new Error("Keypair missing seed — cannot persist Continuity session");
  return {
    seed: kp.seed,
    nextLeaf: kp.nextLeaf,
    address: kp.address,
    scheme: kp.scheme ?? "PIX-HASH-OTS-128",
  };
}

async function restoreWallet(blob: ContinuityWalletBlob): Promise<LightKeypair> {
  const scheme = blob.scheme ?? "PIX-HASH-OTS-128";
  if (scheme === "PIX-ML-DSA-65") {
    const { hexToBytes } = await import("./crypto");
    return generatePixelKeypair("PIX-ML-DSA-65", hexToBytes(blob.seed));
  }
  return restoreLightKeypair(blob.seed, blob.nextLeaf);
}

/** Farm light rewards until `from` can cover `need` (lab Continuity float). */
async function ensureSpendable(
  chain: PixelChainState,
  from: LightKeypair,
  need: number,
): Promise<PixelChainState> {
  let state = chain;
  let guard = 0;
  while (balanceOf(state, from.address) < need) {
    if (++guard > 500) throw new Error(`Could not fund Continuity float to ${need} PIX`);
    const have = balanceOf(state, from.address);
    const step = Math.max(1, Math.min(have, 1));
    const spoken = await proposeTransfer(state, from, [{ address: from.address, amount: step }], {
      description: "Continuity float — light reward farm",
      recipientLabel: "sequencer",
      reference: `FARM-${state.pixels.length}`,
    });
    state = await sequenceBlock(spoken.state, from);
  }
  return state;
}

/** Continuity booth uses ML-DSA so float farming is not capped by the OTS leaf window. */
async function continuityKeypair(): Promise<LightKeypair> {
  return generatePixelKeypair("PIX-ML-DSA-65");
}

export async function createContinuitySession(params: {
  storeId: string;
  domain: string;
  chain?: PixelChainState;
  sequencer?: LightKeypair;
  /** When set, refuse to start a booth on a different canvas */
  expectedCanvas?: CanvasId;
}): Promise<ContinuitySession> {
  const sequencer = params.sequencer ?? (await continuityKeypair());
  let chain = params.chain ?? (await createGenesis(sequencer));
  if (!(await verifyChain(chain))) throw new Error("Invalid Continuity chain");
  if (params.expectedCanvas) {
    assertSameCanvas(params.expectedCanvas, canvasIdOf(chain));
  }

  const merchant = await continuityKeypair();
  const till = await continuityKeypair();

  // Seed merchant with a small booth float; pre-farm sequencer float for snappy booth pays.
  const floatPix = 10;
  const sequencerFloat = 500;
  chain = await ensureSpendable(chain, sequencer, sequencerFloat);
  const fund = await proposeTransfer(
    chain,
    sequencer,
    [{ address: merchant.address, amount: floatPix }],
    {
      description: `Continuity treasury → merchant ${params.domain}`,
      recipientLabel: params.domain,
      reference: `MCF-FUND-${params.storeId.slice(0, 8)}`,
    },
  );
  chain = await sequenceBlock(fund.state, sequencer);

  return {
    chain,
    sequencer,
    merchant,
    till,
    storeId: params.storeId,
    domain: params.domain,
  };
}

export async function exportContinuitySession(
  session: ContinuitySession,
): Promise<ContinuitySessionBlob> {
  const canvas = canvasIdOf(session.chain);
  return {
    networkId: canvas.networkId,
    genesisHash: canvas.genesisHash,
    chainJson: serializeChain(session.chain),
    sequencer: await walletBlob(session.sequencer),
    merchant: await walletBlob(session.merchant),
    till: await walletBlob(session.till),
    storeId: session.storeId,
    domain: session.domain,
  };
}

export async function importContinuitySession(
  blob: ContinuitySessionBlob,
): Promise<ContinuitySession> {
  const chain = deserializeChain(blob.chainJson);
  if (!(await verifyChain(chain))) throw new Error("Imported Continuity chain invalid");
  return {
    chain,
    sequencer: await restoreWallet(blob.sequencer),
    merchant: await restoreWallet(blob.merchant),
    till: await restoreWallet(blob.till),
    storeId: blob.storeId,
    domain: blob.domain,
  };
}

export function loadContinuitySessionBlob(): ContinuitySessionBlob | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONTINUITY_CHAIN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ContinuitySessionBlob;
  } catch {
    return null;
  }
}

export function saveContinuitySessionBlob(blob: ContinuitySessionBlob): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CONTINUITY_CHAIN_KEY, JSON.stringify(blob));
}

export interface BoothCheckoutResult {
  session: ContinuitySession;
  ops: ContinuityOpsState;
  settlementTxid: string;
  tillTxid?: string;
  tipIndex: number;
  tipHash: Hex;
  amountPix: number;
  feePix: number;
  merchantBalance: number;
  tillBalance: number;
  originDark: boolean;
  customerAddress: string;
  tipMark: TipMarkReceipt;
  tillTipMark?: TipMarkReceipt;
}

/**
 * Customer pays at Continuity booth — real PIX UTXOs.
 * Flow: fund ephemeral customer → pay merchant → (if till active) merchant → till fee.
 */
export async function settleBoothCheckoutOnPixel(params: {
  ops: ContinuityOpsState;
  session: ContinuitySession;
  amountPix: number;
  orderRef?: string;
  /** How this settle attaches — default lab_local (browser Continuity chain) */
  attachment?: SettlementPlane;
}): Promise<BoothCheckoutResult> {
  const { ops, amountPix } = params;
  let session = params.session;
  if (amountPix <= 0) throw new Error("amountPix must be positive");
  const attachment = params.attachment ?? "lab_local";

  const store = ops.stores.find((s) => s.id === session.storeId);
  if (!store) throw new Error("Store not found for Continuity session");
  if (store.step !== "live" || !store.anchoredOnPixel) {
    throw new Error("Store must be live and anchored on Pixel before booth checkout");
  }
  if (store.genesisHash) {
    assertSameCanvas(
      { networkId: store.networkId ?? session.chain.networkId, genesisHash: store.genesisHash },
      canvasIdOf(session.chain),
    );
  }

  const orderRef = params.orderRef ?? `MCF-${Date.now().toString(36)}`;
  const customer = await continuityKeypair();

  // Fund customer from sequencer (farm light rewards if needed — lab booth float).
  session = {
    ...session,
    chain: await ensureSpendable(session.chain, session.sequencer, amountPix),
  };
  const funded = await proposeTransfer(
    session.chain,
    session.sequencer,
    [{ address: customer.address, amount: amountPix }],
    {
      description: `Booth float → customer ${store.domain}`,
      recipientLabel: "booth-customer",
      reference: `FLOAT-${orderRef}`,
    },
  );
  session = { ...session, chain: await sequenceBlock(funded.state, session.sequencer) };

  // Customer pays merchant (the sale).
  const spoken = await proposeTransfer(
    session.chain,
    customer,
    [{ address: session.merchant.address, amount: amountPix }],
    {
      description: `Booth checkout ${store.name} · ${amountPix} PIX`,
      recipientLabel: store.domain,
      reference: orderRef,
    },
  );
  session = { ...session, chain: await sequenceBlock(spoken.state, session.sequencer) };
  const tipAfterSale = session.chain.pixels[session.chain.pixels.length - 1]!;
  const settlementTxid = tipAfterSale.transactions[tipAfterSale.transactions.length - 1]!.txid;

  let feePix = 0;
  let tillTxid: string | undefined;
  let nextOps = patchStore(ops, store.id, {
    merchantAddress: session.merchant.address,
    tillAddress: session.till.address,
  });
  const originDark = store.continuity?.state === "origin_dark";

  if (tillIsActive(store)) {
    feePix = tillFeePix(store, amountPix);
    if (feePix > 0) {
      const tillSpoken = await proposeTransfer(
        session.chain,
        session.merchant,
        [{ address: session.till.address, amount: feePix }],
        {
          description: `Continuity till ${feePix} PIX (${store.domain})`,
          recipientLabel: "continuity-till",
          reference: `TILL-${orderRef}`,
        },
      );
      session = { ...session, chain: await sequenceBlock(tillSpoken.state, session.sequencer) };
      const tipTill = session.chain.pixels[session.chain.pixels.length - 1]!;
      tillTxid = tipTill.transactions[tipTill.transactions.length - 1]!.txid;

      const refreshed = nextOps.stores.find((s) => s.id === store.id)!;
      nextOps = patchStore(nextOps, store.id, {
        tillEvents: [
          ...(refreshed.tillEvents ?? []),
          {
            id: `till-${Date.now().toString(36)}`,
            at: Date.now(),
            amountPix,
            feePix,
            bps: store.tillCutBpsWhenOriginDark,
            via: originDark ? "mirror" : "origin",
            note: `on-chain ${tillTxid.slice(0, 16)}…`,
            txid: tillTxid,
            pixelIndex: tipTill.index,
            onChain: true,
          },
        ],
        merchantAddress: session.merchant.address,
        tillAddress: session.till.address,
      });
    }
  }

  const tipMark = tipMarkFromState(session.chain, "booth-sale", attachment, settlementTxid);
  const tillTipMark = tillTxid
    ? tipMarkFromState(session.chain, "booth-till", attachment, tillTxid)
    : undefined;
  const tip = session.chain.pixels[session.chain.pixels.length - 1]!;
  return {
    session,
    ops: nextOps,
    settlementTxid,
    tillTxid,
    tipIndex: tip.index,
    tipHash: tip.hash,
    amountPix,
    feePix,
    merchantBalance: balanceOf(session.chain, session.merchant.address),
    tillBalance: balanceOf(session.chain, session.till.address),
    originDark,
    customerAddress: customer.address,
    tipMark,
    tillTipMark,
  };
}

export interface ContinuityOrderRequest {
  storeDomain: string;
  amountPix: number;
  orderRef?: string;
  via?: "webhook" | "booth" | "popmenu" | "simulated";
  note?: string;
}

export interface ContinuityOrderResult {
  ok: true;
  storeId: string;
  tipIndex: number;
  tipHash: Hex;
  settlementTxid: string;
  tillTxid?: string;
  feePix: number;
  accruedPix: number;
  originDark: boolean;
  merchantBalance: number;
  tillBalance: number;
  tipMark: TipMarkReceipt;
  canvas: string;
}

/** Generic order handler — Popmenu/Toast can POST into this shape later. */
export async function handleContinuityOrder(params: {
  ops: ContinuityOpsState;
  session: ContinuitySession;
  req: ContinuityOrderRequest;
  /** Node webhook defaults to node_sidecar — not the ledger tip Billboard shows */
  attachment?: SettlementPlane;
}): Promise<{
  result: ContinuityOrderResult;
  session: ContinuitySession;
  ops: ContinuityOpsState;
}> {
  const store = findStoreByDomain(params.ops, params.req.storeDomain);
  if (!store) throw new Error(`No Continuity store for ${params.req.storeDomain}`);
  if (params.session.storeId !== store.id && params.session.domain !== store.domain) {
    throw new Error("Session/store domain mismatch");
  }

  const settled = await settleBoothCheckoutOnPixel({
    ops: params.ops,
    session: { ...params.session, storeId: store.id },
    amountPix: params.req.amountPix,
    orderRef: params.req.orderRef,
    attachment: params.attachment ?? "node_sidecar",
  });

  const accruedPix = (settled.ops.stores.find((s) => s.id === store.id)?.tillEvents ?? []).reduce(
    (n, e) => n + e.feePix,
    0,
  );

  return {
    session: settled.session,
    ops: settled.ops,
    result: {
      ok: true,
      storeId: store.id,
      tipIndex: settled.tipIndex,
      tipHash: settled.tipHash,
      settlementTxid: settled.settlementTxid,
      tillTxid: settled.tillTxid,
      feePix: settled.feePix,
      accruedPix,
      originDark: settled.originDark,
      merchantBalance: settled.merchantBalance,
      tillBalance: settled.tillBalance,
      tipMark: settled.tipMark,
      canvas: formatCanvasId(settled.tipMark.canvasId),
    },
  };
}

export function boothHonesty(plane: SettlementPlane = "lab_local"): string {
  return `${settlementHonesty(plane)} Live menu/order can still open on Popmenu. Pixel does not take over merchant DNS.`;
}

export function findStoreByDomain(
  ops: ContinuityOpsState,
  domain: string,
): ContinuityStore | undefined {
  const d = domain.replace(/^www\./, "").toLowerCase();
  return ops.stores.find((s) => {
    const sd = s.domain.replace(/^www\./, "").toLowerCase();
    return sd === d || s.domain.toLowerCase() === domain.toLowerCase();
  });
}

/** Ensure a Continuity settlement session exists for this store (create + persist blob). */
export async function ensureContinuitySession(params: {
  ops: ContinuityOpsState;
  storeId: string;
  existing?: ContinuitySession | null;
}): Promise<{ session: ContinuitySession; ops: ContinuityOpsState }> {
  const store = params.ops.stores.find((s) => s.id === params.storeId);
  if (!store) throw new Error("Store not found");
  const expected =
    store.genesisHash != null
      ? {
          networkId: store.networkId ?? PIXEL_NETWORK_FALLBACK,
          genesisHash: store.genesisHash,
        }
      : undefined;
  if (params.existing && params.existing.storeId === store.id) {
    if (expected) assertSameCanvas(expected, canvasIdOf(params.existing.chain));
    return { session: params.existing, ops: params.ops };
  }
  if (expected) {
    throw new Error(
      `No Continuity session on canvas ${formatCanvasId(expected)}. Go live again so the booth binds to the map tip — refuse a second Earth.`,
    );
  }
  const session = await createContinuitySession({
    storeId: store.id,
    domain: store.domain,
  });
  const ops = patchStore(params.ops, store.id, {
    merchantAddress: session.merchant.address,
    tillAddress: session.till.address,
    genesisHash: canvasIdOf(session.chain).genesisHash,
    networkId: session.chain.networkId,
    canvasId: `${session.chain.networkId}:${canvasIdOf(session.chain).genesisHash}`,
    tipMarkAttachment: "lab_local",
  });
  return { session, ops };
}

/** Avoid hard import cycle with chain constant in ensure path. */
const PIXEL_NETWORK_FALLBACK = 0x5049;

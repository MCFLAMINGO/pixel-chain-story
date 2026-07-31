/**
 * HTTP JSON-RPC + REST helpers for Pixel Ledger nodes.
 */

import type { PixelLedgerNode } from "./node";
import type { JsonRpcRequest, Transaction } from "../lib/pixel/index";
import {
  MAX_RPC_BODY_BYTES,
  jsonRpcRequestSchema,
  parseJsonWithSchema,
  readBodyWithLimit,
  transactionSchema,
  ValidationError,
} from "../lib/pixel/validators";
import { handleContinuityHttp, type ContinuityHttpCtx } from "./continuity-http";
import { readSepoliaBridgeConfig } from "../lib/pixel/eth-usdc-lock";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Continuity-Secret",
};

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function text(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(body, { ...init, headers });
}

export interface RpcServerOpts {
  /** Datadir for Continuity ops / session (default: node.datadir). */
  continuityDatadir?: string;
  /** Shared secret for Continuity webhook + ops write. Env: CONTINUITY_WEBHOOK_SECRET */
  continuityWebhookSecret?: string;
}

export function startRpcServer(node: PixelLedgerNode, port: number, opts: RpcServerOpts = {}) {
  const continuityCtx: ContinuityHttpCtx = {
    datadir: opts.continuityDatadir ?? node.datadir,
    webhookSecret: opts.continuityWebhookSecret ?? process.env.CONTINUITY_WEBHOOK_SECRET ?? "",
  };

  const server = Bun.serve({
    port,
    async fetch(req) {
      if (req.method === "OPTIONS") {
        return text("", { status: 204 });
      }

      const url = new URL(req.url);

      const continuity = await handleContinuityHttp(req, url, continuityCtx);
      if (continuity) return continuity;

      if (req.method === "GET" && url.pathname === "/health") {
        const snap = node.syncSnapshot();
        return json({
          ok: true,
          name: "Pixel Ledger",
          address: snap.address,
          publicKey: snap.publicKey,
          networkId: snap.networkId,
          genesisHash: snap.genesisHash,
          canvasId: snap.canvasId,
          pixels: snap.pixels.length,
          tip: snap.tip,
          tipHash: snap.tipHash,
          pending: node.chain.pending.length,
          peers: node.gossip.peerCount(),
          gossipUrl: snap.gossipUrl,
          gate: "F",
          transport: snap.transport,
          continuity: {
            webhook: Boolean(continuityCtx.webhookSecret),
            paths: [
              "GET /continuity/invite/:token",
              "POST /continuity/join",
              "POST /continuity/order",
              "PUT|GET /continuity/ops",
            ],
          },
          bridgeLab:
            process.env.PIXEL_BRIDGE_LAB === "1" || process.env.PIXEL_BRIDGE_LAB === "true",
          faucet:
            process.env.PIXEL_FAUCET === "1" ||
            process.env.PIXEL_FAUCET === "true" ||
            process.env.PIXEL_BRIDGE_LAB === "1" ||
            process.env.PIXEL_BRIDGE_LAB === "true",
          bridgeSepolia: (() => {
            const cfg = readSepoliaBridgeConfig();
            if (!cfg) return null;
            return {
              chainId: cfg.chainId,
              lock: cfg.lockContract,
              usdc: cfg.usdcContract || null,
              explorerTxBase: cfg.explorerTxBase,
            };
          })(),
        });
      }

      /** Full sync package for `pixel join` — joiners pull this. */
      if (req.method === "GET" && url.pathname === "/sync") {
        return json(node.syncSnapshot());
      }

      /** Headers-first sync — light clients verify tip without full bodies. */
      if (req.method === "GET" && url.pathname === "/sync/headers") {
        return json(await node.headersSyncSnapshot());
      }

      /** Sparse illuminated picture snapshot (SPATIAL S3). */
      if (req.method === "GET" && url.pathname === "/spatial/snapshot") {
        return json(await node.spatialSnapshot());
      }

      /** Merkle proof that a cell is lit in the tip picture. */
      if (req.method === "GET" && url.pathname.startsWith("/spatial/proof/")) {
        const idx = Number(url.pathname.slice("/spatial/proof/".length));
        if (!Number.isInteger(idx) || idx < 0) {
          return json({ ok: false, error: "bad cell index" }, { status: 400 });
        }
        return json(await node.illuminatedCellProof(idx));
      }

      /** Last wave fan-out event (S4 notify plane — not consensus truth). */
      if (req.method === "GET" && url.pathname === "/wave/tip") {
        const last = node.waveBus.last();
        if (!last) {
          const tip = node.chain.pixels[node.chain.pixels.length - 1];
          if (!tip) return json({ ok: false, error: "no tip" }, { status: 404 });
          return json({
            tipIndex: tip.index,
            tipHash: tip.hash,
            waveDigest: tip.lightProof.waveDigest,
            hits: tip.wave ?? [],
            source: "tip",
            at: tip.timestamp,
            note: "no fan-out yet — tip-bound wave field",
          });
        }
        return json(last);
      }

      if (req.method === "GET" && url.pathname === "/pixels") {
        return json(node.chain.pixels);
      }

      if (req.method === "GET" && url.pathname.startsWith("/balance/")) {
        const rest = url.pathname.slice("/balance/".length);
        if (rest.endsWith("/proof") || url.searchParams.get("proof") === "1") {
          const addr = decodeURIComponent(rest.replace(/\/proof$/, ""));
          return json(await node.balanceProof(addr));
        }
        const address = decodeURIComponent(rest);
        return json({ address, balance: node.balance(address) });
      }

      /** Fund a new pay face (PIXEL_FAUCET=1 or PIXEL_BRIDGE_LAB=1). */
      if (req.method === "POST" && url.pathname === "/faucet") {
        const enabled =
          process.env.PIXEL_FAUCET === "1" ||
          process.env.PIXEL_FAUCET === "true" ||
          process.env.PIXEL_BRIDGE_LAB === "1" ||
          process.env.PIXEL_BRIDGE_LAB === "true";
        if (!enabled) {
          return json({ ok: false, error: "faucet not enabled on this tip" }, { status: 404 });
        }
        const body = await readBodyWithLimit(req, MAX_RPC_BODY_BYTES);
        if (!body.ok) {
          return json({ ok: false, error: body.error }, { status: 413 });
        }
        let parsed: { address?: string; amount?: number };
        try {
          parsed = JSON.parse(body.text) as typeof parsed;
        } catch {
          return json({ ok: false, error: "bad json" }, { status: 400 });
        }
        try {
          const out = await node.faucetPayFace({
            address: String(parsed.address ?? ""),
            amount: parsed.amount != null ? Number(parsed.amount) : undefined,
          });
          return json({ ok: true, ...out });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "faucet failed";
          return json({ ok: false, error: msg }, { status: 400 });
        }
      }

      /**
       * Verified Sepolia (or configured) PixelUsdcLock.Locked → PIX on pay face.
       * Body: { txHash, ownerAddress, ownerLocalId? }
       */
      if (req.method === "POST" && url.pathname === "/bridge/shine-in-lock") {
        if (!readSepoliaBridgeConfig()) {
          return json(
            {
              ok: false,
              error:
                "Sepolia lock bridge not configured — set PIXEL_USDC_LOCK_SEPOLIA + PIXEL_ETH_RPC",
            },
            { status: 404 },
          );
        }
        const body = await readBodyWithLimit(req, MAX_RPC_BODY_BYTES);
        if (!body.ok) {
          return json({ ok: false, error: body.error }, { status: 413 });
        }
        let parsed: { txHash?: string; ownerAddress?: string; ownerLocalId?: string };
        try {
          parsed = JSON.parse(body.text) as typeof parsed;
        } catch {
          return json({ ok: false, error: "bad json" }, { status: 400 });
        }
        try {
          const out = await node.shineInFromUsdcLockTx({
            txHash: String(parsed.txHash ?? ""),
            ownerAddress: String(parsed.ownerAddress ?? ""),
            ownerLocalId: parsed.ownerLocalId
              ? String(parsed.ownerLocalId).slice(0, 64)
              : undefined,
          });
          return json({ ok: true, ...out });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "lock bridge failed";
          return json({ ok: false, error: msg }, { status: 400 });
        }
      }

      /** Phone-wallet lab bridge — USDC/ETH/wire → PIX (PIXEL_BRIDGE_LAB=1 demo only). */
      if (req.method === "POST" && url.pathname === "/bridge/shine-in") {
        const enabled =
          process.env.PIXEL_BRIDGE_LAB === "1" || process.env.PIXEL_BRIDGE_LAB === "true";
        if (!enabled) {
          return json(
            { ok: false, error: "PIXEL_BRIDGE_LAB not enabled — tip refuses open shine-in" },
            { status: 404 },
          );
        }
        const body = await readBodyWithLimit(req, MAX_RPC_BODY_BYTES);
        if (!body.ok) {
          return json({ ok: false, error: body.error }, { status: 413 });
        }
        let parsed: {
          asset?: string;
          humanUsd?: number;
          ownerAddress?: string;
          ownerLocalId?: string;
        };
        try {
          parsed = JSON.parse(body.text) as typeof parsed;
        } catch {
          return json({ ok: false, error: "bad json" }, { status: 400 });
        }
        const asset = parsed.asset;
        if (asset !== "USDC" && asset !== "ETH" && asset !== "USD") {
          return json({ ok: false, error: "asset must be USDC | ETH | USD" }, { status: 400 });
        }
        try {
          const out = await node.labBridgeShineIn({
            asset,
            humanUsd: Number(parsed.humanUsd),
            ownerAddress: String(parsed.ownerAddress ?? ""),
            ownerLocalId: String(parsed.ownerLocalId ?? "phone").slice(0, 64),
          });
          return json({ ok: true, plane: "shared_tip", lab: true, ...out });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "bridge failed";
          return json({ ok: false, error: msg }, { status: 400 });
        }
      }

      /** Submit a signed tx into mempool + gossip (Gate B live path). */
      if (req.method === "POST" && url.pathname === "/tx") {
        const body = await readBodyWithLimit(req, MAX_RPC_BODY_BYTES);
        if (!body.ok) {
          return json({ ok: false, error: body.error }, { status: 413 });
        }
        let tx: Transaction;
        try {
          tx = parseJsonWithSchema(body.text, transactionSchema, {
            maxBytes: MAX_RPC_BODY_BYTES,
            label: "tx",
          }) as Transaction;
        } catch (e) {
          const msg = e instanceof ValidationError ? e.message : "bad tx";
          return json({ ok: false, error: msg }, { status: 400 });
        }
        await node.submitTx(tx);
        // Elected sequencer may be this node — try illuminate
        await node.trySequence();
        return json({
          ok: true,
          tip: node.chain.pixels.length - 1,
          pending: node.chain.pending.length,
          txid: tx.txid,
        });
      }

      if (req.method === "POST" && (url.pathname === "/" || url.pathname === "/rpc")) {
        const body = await readBodyWithLimit(req, MAX_RPC_BODY_BYTES);
        if (!body.ok) {
          return json({ ok: false, error: body.error }, { status: 413 });
        }
        let rpcReq: JsonRpcRequest;
        try {
          rpcReq = parseJsonWithSchema(body.text, jsonRpcRequestSchema, {
            maxBytes: MAX_RPC_BODY_BYTES,
            label: "rpc",
          }) as JsonRpcRequest;
        } catch (e) {
          const msg = e instanceof ValidationError ? e.message : "bad rpc";
          return json(
            { jsonrpc: "2.0", id: null, error: { code: -32700, message: msg } },
            { status: 400 },
          );
        }
        const result = await node.rpc(rpcReq);
        return json(result);
      }

      return text(
        "Pixel Ledger — POST /rpc | POST /tx | GET /health | GET /sync | GET /spatial/snapshot | GET /wave/tip | Continuity: /continuity/invite/:token | POST /continuity/order",
        { status: 200 },
      );
    },
  });

  console.log(`[pixel-ledger] rpc http://127.0.0.1:${port}`);
  if (continuityCtx.webhookSecret) {
    console.log(`[pixel-ledger] Continuity webhook armed (POST /continuity/order)`);
  } else {
    console.log(
      `[pixel-ledger] Continuity invite GET open; set CONTINUITY_WEBHOOK_SECRET for order webhook`,
    );
  }
  return server;
}

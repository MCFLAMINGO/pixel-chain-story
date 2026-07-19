/**
 * HTTP JSON-RPC + REST helpers for Pixel Ledger nodes.
 */

import type { PixelLedgerNode } from "./node";
import type { JsonRpcRequest, Transaction } from "../lib/pixel/index";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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

export function startRpcServer(node: PixelLedgerNode, port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      if (req.method === "OPTIONS") {
        return text("", { status: 204 });
      }

      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/health") {
        const snap = node.syncSnapshot();
        return json({
          ok: true,
          name: "Pixel Ledger",
          address: snap.address,
          publicKey: snap.publicKey,
          pixels: snap.pixels.length,
          tip: snap.tip,
          tipHash: snap.tipHash,
          pending: node.chain.pending.length,
          peers: node.gossip.peerCount(),
          gossipUrl: snap.gossipUrl,
          gate: "F",
          transport: snap.transport,
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

      /** Submit a signed tx into mempool + gossip (Gate B live path). */
      if (req.method === "POST" && url.pathname === "/tx") {
        const tx = (await req.json()) as Transaction;
        if (!tx?.txid || !Array.isArray(tx.inputs)) {
          return json({ ok: false, error: "bad tx" }, { status: 400 });
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
        const body = (await req.json()) as JsonRpcRequest;
        const result = await node.rpc(body);
        return json(result);
      }

      return text(
        "Pixel Ledger — POST /rpc | POST /tx | GET /health | GET /sync | GET /sync/headers | GET /pixels | GET /balance/:addr[/proof]",
        { status: 200 },
      );
    },
  });

  console.log(`[pixel-ledger] rpc http://127.0.0.1:${port}`);
  return server;
}

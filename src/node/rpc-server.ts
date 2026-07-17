/**
 * HTTP JSON-RPC + REST helpers for Pixel Ledger nodes.
 */

import type { PixelLedgerNode } from "./node";
import type { JsonRpcRequest, Transaction } from "../lib/pixel/index";

export function startRpcServer(node: PixelLedgerNode, port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/health") {
        const snap = node.syncSnapshot();
        return Response.json({
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
          gate: "B",
        });
      }

      /** Full sync package for `pixel join` — pixels + sequencers + gossip dial. */
      if (req.method === "GET" && url.pathname === "/sync") {
        return Response.json(node.syncSnapshot());
      }

      if (req.method === "GET" && url.pathname === "/pixels") {
        return Response.json(node.chain.pixels);
      }

      if (req.method === "GET" && url.pathname.startsWith("/balance/")) {
        const address = decodeURIComponent(url.pathname.slice("/balance/".length));
        return Response.json({ address, balance: node.balance(address) });
      }

      /** Submit a signed tx into mempool + gossip (Gate B live path). */
      if (req.method === "POST" && url.pathname === "/tx") {
        const tx = (await req.json()) as Transaction;
        if (!tx?.txid || !Array.isArray(tx.inputs)) {
          return Response.json({ ok: false, error: "bad tx" }, { status: 400 });
        }
        await node.submitTx(tx);
        // Elected sequencer may be this node — try illuminate
        await node.trySequence();
        return Response.json({
          ok: true,
          tip: node.chain.pixels.length - 1,
          pending: node.chain.pending.length,
          txid: tx.txid,
        });
      }

      if (req.method === "POST" && (url.pathname === "/" || url.pathname === "/rpc")) {
        const body = (await req.json()) as JsonRpcRequest;
        const result = await node.rpc(body);
        return Response.json(result);
      }

      return new Response(
        "Pixel Ledger — POST /rpc | POST /tx | GET /health | GET /sync | GET /pixels | GET /balance/:addr",
        { status: 200 },
      );
    },
  });

  console.log(`[pixel-ledger] rpc http://127.0.0.1:${port}`);
  return server;
}

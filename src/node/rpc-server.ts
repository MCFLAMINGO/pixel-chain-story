/**
 * HTTP JSON-RPC + REST helpers for Pixel Ledger nodes.
 */

import type { PixelLedgerNode } from "./node";
import type { JsonRpcRequest } from "../lib/pixel/index";

export function startRpcServer(node: PixelLedgerNode, port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/health") {
        return Response.json({
          ok: true,
          name: "Pixel Ledger",
          address: node.keypair.address,
          pixels: node.chain.pixels.length,
          pending: node.chain.pending.length,
          peers: node.gossip.peerCount(),
        });
      }

      if (req.method === "GET" && url.pathname === "/pixels") {
        return Response.json(node.chain.pixels);
      }

      if (req.method === "GET" && url.pathname.startsWith("/balance/")) {
        const address = decodeURIComponent(url.pathname.slice("/balance/".length));
        return Response.json({ address, balance: node.balance(address) });
      }

      if (req.method === "POST" && (url.pathname === "/" || url.pathname === "/rpc")) {
        const body = (await req.json()) as JsonRpcRequest;
        const result = await node.rpc(body);
        return Response.json(result);
      }

      return new Response(
        "Pixel Ledger RPC — POST /rpc | GET /health | GET /pixels | GET /balance/:addr",
        { status: 200 },
      );
    },
  });

  console.log(`[pixel-ledger] rpc http://127.0.0.1:${port}`);
  return server;
}

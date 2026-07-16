/**
 * Pixel JSON-RPC — Ethereum-familiar developer surface.
 *
 * Method names echo eth_/net_ habits so wallet and tooling engineers can
 * evaluate the protocol in under a minute. Every method executes against a
 * live in-memory chain (not stubs).
 */

import { balanceOf, type PixelChainState, type PixelBlock, verifyChain } from "./chain";
import { estimatePoLSCost } from "./pol";
import type { Transaction } from "./transaction";

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown[];
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

export interface PixelRpcContext {
  chain: PixelChainState;
  networkId: number;
  clientVersion: string;
}

function headerView(block: PixelBlock) {
  return {
    number: `0x${block.index.toString(16)}`,
    hash: `0x${block.hash.slice(0, 64)}`,
    parentHash: `0x${block.prevHash.slice(0, 64)}`,
    timestamp: `0x${Math.floor(block.timestamp / 1000).toString(16)}`,
    sequencer: block.lightProof.sequencerAddress,
    sequence: block.sequence,
    merkleRoot: `0x${block.merkleRoot.slice(0, 64)}`,
    beacon: `0x${block.lightProof.beacon.slice(0, 32)}`,
    transactions: block.transactions.map((t) => `0x${t.txid.slice(0, 64)}`),
    pixel: block.color,
  };
}

function txView(tx: Transaction, viewer: "party" | "public" = "public") {
  const veiled = tx.privacy !== "public" && viewer === "public";
  return {
    hash: `0x${tx.txid.slice(0, 64)}`,
    status: tx.state,
    privacy: tx.privacy,
    commitment: `0x${tx.commitment.slice(0, 64)}`,
    from: tx.inputs[0]?.publicKey ? `pubkey:${tx.inputs[0].publicKey.slice(0, 16)}…` : "coinbase",
    to: tx.metadata.recipientLabel ?? tx.outputs[0]?.address,
    value: veiled ? null : (tx.outputs[0]?.amount ?? 0),
    memo: veiled && tx.privacy === "private" ? null : tx.metadata.description,
    lightSequence: tx.lightSequence ?? null,
  };
}

export async function handlePixelRpc(
  ctx: PixelRpcContext,
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const id = req.id ?? null;
  try {
    const params = req.params ?? [];
    switch (req.method) {
      case "web3_clientVersion":
        return ok(id, ctx.clientVersion);
      case "net_version":
        return ok(id, String(ctx.networkId));
      case "pix_chainId":
        return ok(id, `0x${ctx.networkId.toString(16)}`);
      case "pix_blockNumber":
        return ok(id, `0x${(ctx.chain.blocks.length - 1).toString(16)}`);
      case "pix_getBlockByNumber": {
        const tag = String(params[0] ?? "latest");
        const idx = tag === "latest" ? ctx.chain.blocks.length - 1 : parseInt(tag, 16);
        const block = ctx.chain.blocks[idx];
        if (!block) throw rpcError(-32602, "block not found");
        return ok(id, headerView(block));
      }
      case "pix_getBalance": {
        const address = String(params[0] ?? "");
        return ok(id, balanceOf(ctx.chain, address));
      }
      case "pix_getPending":
        return ok(
          id,
          ctx.chain.pending.map((t) => txView(t, "party")),
        );
      case "pix_verifyChain":
        return ok(id, {
          valid: await verifyChain(ctx.chain),
          blocks: ctx.chain.blocks.length,
          pending: ctx.chain.pending.length,
        });
      case "pix_getEnergyProfile":
        return ok(id, estimatePoLSCost());
      case "pix_getLedgerPixels":
        return ok(
          id,
          ctx.chain.blocks.map((b) => ({
            index: b.index,
            color: b.color,
            hash: b.hash.slice(0, 16),
          })),
        );
      case "pix_protocolInfo":
        return ok(id, {
          name: "Pixel",
          consensus: "Proof of Light Sequence (PoLS)",
          signatures: "PIX-HASH-OTS-128 (hash-based, quantum-resistant)",
          hash: "SHA-512",
          model: "UTXO",
          language: "Lumen (light-native) + TypeScript host",
          finality: "light-revelation (sequencer signature + beacon)",
          ethereumAnalogues: {
            sequencer: "PBS / based sequencing (single light proof)",
            pendingPool: "mempools — held as superposition ghosts",
            finality: "soft finality via PoLS; upgradeable to restaked quorum",
            lightClient: "header + merkle + light proof (phone-capable)",
            pqc: "aligns with Ethereum PQ migration research",
          },
        });
      default:
        throw rpcError(-32601, `method not found: ${req.method}`);
    }
  } catch (err) {
    if (isRpcError(err)) {
      return { jsonrpc: "2.0", id, error: err };
    }
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : "execution reverted",
      },
    };
  }
}

function ok(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(code: number, message: string) {
  return { code, message };
}

function isRpcError(err: unknown): err is { code: number; message: string } {
  return typeof err === "object" && err !== null && "code" in err && "message" in err;
}

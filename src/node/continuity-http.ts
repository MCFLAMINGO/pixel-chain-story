/**
 * Continuity HTTP handlers for Pixel RPC — invites + order webhook.
 * Honesty: Continuity ops, not “Pixel hosts the internet.”
 */

import {
  merchantJoin,
  patchStore,
  storeByInvite,
  type ContinuityOpsState,
} from "../lib/pixel/continuity-ops";
import {
  buildInvitePack,
  publicInviteView,
  type ContinuityInvitePack,
} from "../lib/pixel/continuity-invite-pack";
import {
  createContinuitySession,
  handleContinuityOrder,
  type ContinuityOrderRequest,
  type ContinuitySession,
} from "../lib/pixel/continuity-settlement";
import {
  loadContinuityOps,
  loadContinuitySession,
  saveContinuityOps,
  saveContinuitySession,
} from "./continuity-store";

export interface ContinuityHttpCtx {
  datadir: string;
  /** Shared secret for PUT ops / POST order. Empty = invite GET + public join only. */
  webhookSecret: string;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Continuity-Secret",
  };
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function unauthorized(): Response {
  return json(
    { ok: false, error: "unauthorized — Continuity webhook secret required" },
    { status: 401 },
  );
}

function checkSecret(req: Request, secret: string): boolean {
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const header = req.headers.get("x-continuity-secret") ?? "";
  return bearer === secret || header === secret;
}

/**
 * Handle Continuity paths. Returns null if the path is not Continuity.
 */
export async function handleContinuityHttp(
  req: Request,
  url: URL,
  ctx: ContinuityHttpCtx,
): Promise<Response | null> {
  const { datadir, webhookSecret } = ctx;

  if (req.method === "OPTIONS" && url.pathname.startsWith("/continuity")) {
    return new Response("", { status: 204, headers: corsHeaders() });
  }

  // Public invite view — cross-phone when ops live on the node.
  if (req.method === "GET" && url.pathname.startsWith("/continuity/invite/")) {
    const token = decodeURIComponent(url.pathname.slice("/continuity/invite/".length));
    const ops = await loadContinuityOps(datadir);
    const store = storeByInvite(ops, token);
    if (!store) return json({ ok: false, error: "invite not found" }, { status: 404 });
    return json({ ok: true, invite: publicInviteView(store) });
  }

  // Export full invite pack (operator — secret).
  if (req.method === "GET" && url.pathname.startsWith("/continuity/pack/")) {
    if (!checkSecret(req, webhookSecret)) return unauthorized();
    const storeId = decodeURIComponent(url.pathname.slice("/continuity/pack/".length));
    const ops = await loadContinuityOps(datadir);
    try {
      const pack = buildInvitePack(ops, storeId);
      return json({ ok: true, pack });
    } catch (e) {
      return json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        { status: 404 },
      );
    }
  }

  // Replace Continuity ops (operator sync).
  if (req.method === "PUT" && url.pathname === "/continuity/ops") {
    if (!checkSecret(req, webhookSecret)) return unauthorized();
    const body = (await req.json()) as ContinuityOpsState;
    if (!body?.rungs?.length || !Array.isArray(body.stores)) {
      return json({ ok: false, error: "bad ContinuityOpsState" }, { status: 400 });
    }
    await saveContinuityOps(datadir, body);
    return json({ ok: true, stores: body.stores.length });
  }

  if (req.method === "GET" && url.pathname === "/continuity/ops") {
    if (!checkSecret(req, webhookSecret)) return unauthorized();
    const ops = await loadContinuityOps(datadir);
    return json({ ok: true, ops });
  }

  // Merchant join via node (cross-phone when invite is on the node).
  if (req.method === "POST" && url.pathname === "/continuity/join") {
    if (!checkSecret(req, webhookSecret) && webhookSecret) {
      // Allow join without secret only if invite exists — merchant handshake.
      // When secret is set, still allow public join for the invite token path.
    }
    const body = (await req.json()) as { inviteToken?: string; originUrl?: string };
    if (!body.inviteToken)
      return json({ ok: false, error: "inviteToken required" }, { status: 400 });
    let ops = await loadContinuityOps(datadir);
    try {
      ops = merchantJoin(ops, body.inviteToken, { originUrl: body.originUrl });
      await saveContinuityOps(datadir, ops);
      const store = storeByInvite(ops, body.inviteToken)!;
      return json({ ok: true, invite: publicInviteView(store) });
    } catch (e) {
      return json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
  }

  /**
   * Order webhook — Popmenu/Toast can POST here with shared secret.
   * Settles PIX via handleContinuityOrder when a Continuity session exists.
   */
  if (req.method === "POST" && url.pathname === "/continuity/order") {
    if (!checkSecret(req, webhookSecret)) return unauthorized();
    const body = (await req.json()) as ContinuityOrderRequest;
    if (!body?.storeDomain || !(body.amountPix > 0)) {
      return json({ ok: false, error: "storeDomain + amountPix required" }, { status: 400 });
    }
    let ops = await loadContinuityOps(datadir);
    const store = ops.stores.find(
      (s) =>
        s.domain.replace(/^www\./, "").toLowerCase() ===
          body.storeDomain.replace(/^www\./, "").toLowerCase() ||
        s.domain.toLowerCase() === body.storeDomain.toLowerCase(),
    );
    if (!store) return json({ ok: false, error: "store not found" }, { status: 404 });
    if (store.step !== "live" || !store.anchoredOnPixel) {
      return json(
        { ok: false, error: "store must be live and anchored on Pixel" },
        { status: 409 },
      );
    }

    let session = await loadContinuitySession(datadir);
    if (!session || session.storeId !== store.id) {
      // Tip-mark discipline: if go-live already named a canvas, refuse a second Earth.
      if (store.genesisHash) {
        return json(
          {
            ok: false,
            error:
              "Continuity session missing for store canvas — persist session from goLiveWithSession before /continuity/order",
          },
          { status: 409 },
        );
      }
      session = await createContinuitySession({ storeId: store.id, domain: store.domain });
      ops = patchStore(ops, store.id, {
        merchantAddress: session.merchant.address,
        tillAddress: session.till.address,
        genesisHash: session.chain.pixels[0]?.hash,
        networkId: session.chain.networkId,
        tipMarkAttachment: "node_sidecar",
      });
    }

    try {
      const ordered = await handleContinuityOrder({
        ops,
        session,
        req: { ...body, via: body.via ?? "webhook" },
      });
      await saveContinuityOps(datadir, ordered.ops);
      await saveContinuitySession(datadir, ordered.session);
      return json({
        ok: true,
        result: ordered.result,
        tipMark: ordered.result.tipMark,
        discipline:
          "Settlement on Continuity sidecar (node_sidecar) — real UTXOs, not the node ledger tip Billboard shows. Live menu may still open on the merchant host — Continuity ops, not DNS takeover.",
      });
    } catch (e) {
      return json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
  }

  return null;
}

export type { ContinuityInvitePack, ContinuitySession };

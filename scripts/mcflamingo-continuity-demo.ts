/**
 * McFlamingo continuity demo — origin dies, mirror serves, PIX settles.
 *
 * bun run test:continuity
 *
 * Honesty: mirrored static artifact + Pixel settlement.
 * Not “Pixel replaces AWS compute” / not public DNS failover.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  acceptIntoLight,
  balanceOf,
  canServeWithoutOrigin,
  comeTowardLight,
  createGenesis,
  digestBytes,
  generateLightKeypair,
  markOriginDark,
  proposeTransfer,
  sequenceBlock,
  verifyChain,
} from "../src/lib/pixel/index";

const ROOT = join(import.meta.dir, "..");
const STORE = join(ROOT, "public/mcflamingo/index.html");
const ORIGIN_PORT = 18410 + (process.pid % 400);
const MIRROR_PORT = ORIGIN_PORT + 1;

function serveStatic(html: string, port: number) {
  return Bun.serve({
    port,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/" || path === "/index.html") {
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-pixel-rung": String(port),
          },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
}

async function main() {
  console.log("═══ MCFLAMINGO CONTINUITY DEMO ═══\n");

  const html = await readFile(STORE, "utf8");
  if (!html.includes("McFlamingo")) throw new Error("storefront missing brand");
  const digest = await digestBytes(html);
  console.log("▸ artifact digest", digest.slice(0, 24) + "…");

  const origin = serveStatic(html, ORIGIN_PORT);
  const mirror = serveStatic(html, MIRROR_PORT);
  const originUrl = `http://127.0.0.1:${ORIGIN_PORT}/`;
  const mirrorUrl = `http://127.0.0.1:${MIRROR_PORT}/`;

  const originBody = await (await fetch(originUrl)).text();
  if (originBody !== html) throw new Error("origin serve mismatch");
  console.log("▸ origin up", originUrl);

  let continuity = await comeTowardLight({
    name: "mcflamingo.com",
    kind: "static_site",
    digest,
    languages: ["html"],
    originHost: "aws",
    originUrl,
    mirrors: [mirrorUrl],
  });
  continuity = acceptIntoLight(continuity, 1);
  if (!canServeWithoutOrigin(continuity)) throw new Error("should serve with mirrors");
  console.log("▸ shone into Pixel (in_the_light) ✓");

  // Kill origin — AWS outage stand-in
  origin.stop(true);
  await Bun.sleep(50);
  let originDead = false;
  try {
    await fetch(originUrl, { signal: AbortSignal.timeout(500) });
  } catch {
    originDead = true;
  }
  if (!originDead) throw new Error("origin still reachable after stop");
  continuity = markOriginDark(continuity);
  if (continuity.state !== "origin_dark") throw new Error("expected origin_dark");
  console.log("▸ origin killed (AWS-down stand-in) ✓");

  const mirrorRes = await fetch(mirrorUrl);
  if (!mirrorRes.ok) throw new Error(`mirror HTTP ${mirrorRes.status}`);
  const mirrorBody = await mirrorRes.text();
  if (mirrorBody !== html) throw new Error("mirror bytes ≠ origin artifact");
  if ((await digestBytes(mirrorBody)) !== digest) throw new Error("mirror digest drift");
  if (!canServeWithoutOrigin(continuity)) throw new Error("continuity lost after origin_dark");
  console.log("▸ mirror still serves same McFlamingo menu ✓", mirrorUrl);

  // Checkout settles on Pixel while origin is dark
  const merchant = await generateLightKeypair();
  const customer = await generateLightKeypair();
  let chain = await createGenesis(merchant);
  const { state: pending } = await proposeTransfer(
    chain,
    merchant,
    [{ amount: 3, address: customer.address }],
    {
      description: "McFlamingo smash burger — continuity checkout",
      recipientLabel: "@customer",
      reference: `MCF-${digest.slice(0, 16)}`,
    },
  );
  chain = await sequenceBlock(pending, merchant);
  if (!(await verifyChain(chain))) throw new Error("checkout chain verify failed");
  if (balanceOf(chain, customer.address) !== 3) throw new Error("customer PIX != 3");
  console.log("▸ paid 3 PIX on Pixel while origin dark ✓");

  mirror.stop(true);

  console.log("\nHonesty:");
  console.log("  • Same static menu from peer mirror — not DNS magic for mcflamingo.com");
  console.log("  • Settlement on sequencers — not Pixel running Amazon compute");
  console.log("\n═══ PASS — McFlamingo continuity loop ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

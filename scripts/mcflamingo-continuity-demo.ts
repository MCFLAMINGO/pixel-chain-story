/**
 * McFlamingo continuity demo — real-site origin story, lab kill-origin drill.
 *
 * bun run test:mcflamingo
 *
 * Honesty:
 * - Continuity origin = https://www.mcflamingo.com/ (live Popmenu restaurant)
 * - Digest / kill-origin drill uses public/mcflamingo/homepage-snapshot.html
 *   (captured homepage of the live site) served on local booths
 * - Not “Pixel replaces Popmenu/Toast compute” / not public DNS failover
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
import { isUnusableOriginHtml, MCFLAMINGO_ORIGIN_URL } from "../src/lib/pixel/continuity-ops";

const ROOT = join(import.meta.dir, "..");
const SNAPSHOT = join(ROOT, "public/mcflamingo/homepage-snapshot.html");
const ORIGIN_PORT = 18410 + (process.pid % 400);
const MIRROR_PORT = ORIGIN_PORT + 1;

function serveStatic(html: string, port: number) {
  return Bun.serve({
    port,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/" || path === "/index.html" || path === "/mcflamingo/homepage-snapshot.html") {
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-pixel-rung": String(port),
            "x-pixel-origin-of-truth": MCFLAMINGO_ORIGIN_URL,
          },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
}

async function main() {
  console.log("═══ MCFLAMINGO CONTINUITY DEMO ═══\n");
  console.log("▸ live origin of truth", MCFLAMINGO_ORIGIN_URL);

  const html = await readFile(SNAPSHOT, "utf8");
  if (isUnusableOriginHtml(html)) throw new Error("snapshot looks like a bot challenge");
  if (!/mcflamingo/i.test(html) || !/ponte\s*vedra/i.test(html)) {
    throw new Error("snapshot must be the real McFlamingo homepage capture");
  }
  if (/lagoon fries|sunset shake|continuity demo artifact/i.test(html)) {
    throw new Error("refusing old fake lab menu — use real-site homepage snapshot");
  }
  const digest = await digestBytes(html);
  console.log("▸ Continuity snapshot digest", digest.slice(0, 24) + "…");

  const origin = serveStatic(html, ORIGIN_PORT);
  const mirror = serveStatic(html, MIRROR_PORT);
  const originUrl = `http://127.0.0.1:${ORIGIN_PORT}/`;
  const mirrorUrl = `http://127.0.0.1:${MIRROR_PORT}/`;

  const originBody = await (await fetch(originUrl)).text();
  if (originBody !== html) throw new Error("origin serve mismatch");
  console.log("▸ lab origin booth up", originUrl, "(stand-in while drilling)");

  let continuity = await comeTowardLight({
    name: "mcflamingo.com",
    kind: "static_site",
    digest,
    languages: ["html"],
    originHost: "popmenu",
    originUrl: MCFLAMINGO_ORIGIN_URL,
    mirrors: [mirrorUrl],
  });
  continuity = acceptIntoLight(continuity, 1);
  if (!canServeWithoutOrigin(continuity)) throw new Error("should serve with mirrors");
  console.log("▸ shone into Pixel (in_the_light) ✓ origin recorded as", MCFLAMINGO_ORIGIN_URL);

  // Kill lab booth — AWS/Popmenu-outage stand-in (not killing the public web)
  origin.stop(true);
  await Bun.sleep(50);
  let originDead = false;
  try {
    await fetch(originUrl, { signal: AbortSignal.timeout(500) });
  } catch {
    originDead = true;
  }
  if (!originDead) throw new Error("lab origin booth still reachable after stop");
  continuity = markOriginDark(continuity);
  if (continuity.state !== "origin_dark") throw new Error("expected origin_dark");
  console.log("▸ lab origin booth killed (outage stand-in) ✓");

  const mirrorRes = await fetch(mirrorUrl);
  if (!mirrorRes.ok) throw new Error(`mirror HTTP ${mirrorRes.status}`);
  const mirrorBody = await mirrorRes.text();
  if (mirrorBody !== html) throw new Error("mirror bytes ≠ Continuity snapshot");
  if ((await digestBytes(mirrorBody)) !== digest) throw new Error("mirror digest drift");
  if (!canServeWithoutOrigin(continuity)) throw new Error("continuity lost after origin_dark");
  console.log("▸ mirror still serves McFlamingo homepage snapshot ✓", mirrorUrl);

  // Checkout settles on Pixel while Continuity is origin_dark
  const merchant = await generateLightKeypair();
  const customer = await generateLightKeypair();
  let chain = await createGenesis(merchant);
  const { state: pending } = await proposeTransfer(
    chain,
    merchant,
    [{ amount: 3, address: customer.address }],
    {
      description: "McFlamingo checkout — Continuity while origin dark",
      recipientLabel: "@customer",
      reference: `MCF-${digest.slice(0, 16)}`,
    },
  );
  chain = await sequenceBlock(pending, merchant);
  if (!(await verifyChain(chain))) throw new Error("checkout chain verify failed");
  if (balanceOf(chain, customer.address) !== 3) throw new Error("customer PIX != 3");
  console.log("▸ paid 3 PIX on Pixel while origin_dark ✓");

  mirror.stop(true);

  console.log("\nHonesty:");
  console.log("  • Humans preview/order at", MCFLAMINGO_ORIGIN_URL);
  console.log("  • Continuity map digests a captured homepage of that live site");
  console.log("  • Kill-origin here drills lab booths — not public DNS magic for mcflamingo.com");
  console.log("\n═══ PASS — McFlamingo real-site Continuity loop ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

#!/usr/bin/env bun
/**
 * Check a Pixel tip against every venue it was anchored to. Needs no keys.
 *
 *   bun run anchor:verify -- --pixel 12 \
 *     --anchors robinhood-testnet=0xABC…,ethereum-sepolia=0xDEF…
 *
 * This is the half that matters. Publishing an anchor is something the operator
 * does; verifying one is something a stranger must be able to do, with no
 * account, no key, and no trust in the operator. Every read here is `eth_call`.
 *
 * Exits non-zero when any venue disagrees or has nothing anchored, so it can be
 * run on a schedule as a divergence alarm rather than a manual ritual.
 */

import { existsSync, readFileSync } from "node:fs";
import { anchorDigest, type PixelAnchorRecord } from "../src/lib/pixel/anchor";
import { readAnchor, readHighestAnchored, verifyOnChain } from "../src/lib/pixel/anchor-evm";
import {
  VENUE_CHAINS,
  venueConfig,
  venueSetWarnings,
  type VenueId,
} from "../src/lib/pixel/anchor-venues";

const ANCHORS_FILE = "anchors.json";
/** Generous next to a 6h schedule: only a properly stopped publisher trips it. */
const DEFAULT_MAX_AGE_HOURS = 48;
const DEFAULT_TIP = "https://pixel-tip-production.up.railway.app";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function die(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? "rpc error");
  if (body.result === undefined) throw new Error("empty result");
  return body.result;
}

function assertAddress(value: string, label: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    die(
      `${label} is not an address: "${value}"\n` +
        "  Expected 0x followed by 40 hex characters.\n" +
        "  If that looks like a placeholder, deploy to the venue first:\n" +
        "    bun run anchor:deploy -- --venue <id> --pixel <n>",
    );
  }
  return value;
}

type Row = {
  venue: VenueId;
  contract: string;
  status: "matches" | "diverges" | "absent" | "stale" | "unreachable";
  /** Heights the tip has advanced past this venue's newest claim. */
  behind?: number;
  detail: string;
};

async function main(): Promise<void> {
  // Default to anchors.json. Pasting addresses on the command line is how a
  // placeholder ends up being sent to an RPC as if it were an address.
  let anchorsArg = flag("anchors");
  if (!anchorsArg) {
    if (!existsSync(ANCHORS_FILE)) {
      die(
        `no --anchors given and ${ANCHORS_FILE} not found.\n` +
          "  Either commit the deployed addresses to anchors.json, or pass\n" +
          "  --anchors venue=0xADDRESS[,venue=0xADDRESS]",
      );
    }
    const cfg = JSON.parse(readFileSync(ANCHORS_FILE, "utf8")) as {
      venues?: Record<string, string>;
    };
    const entries = Object.entries(cfg.venues ?? {});
    if (entries.length === 0) die(`${ANCHORS_FILE} lists no venues`);
    anchorsArg = entries.map(([v, c]) => `${v}=${c}`).join(",");
    console.log(`anchors ${ANCHORS_FILE} (${entries.length} venues)`);
  }
  const pairs = anchorsArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rpcOverride = flag("rpc");
  // venue=0xADDRESS, optionally venue=0xADDRESS@https://rpc — so a local or
  // private endpoint can be checked without editing the registry.
  const targets = pairs.map((pair) => {
    const [venue, rest] = pair.split("=");
    if (!venue || !rest) die(`bad --anchors entry "${pair}" — expected venue=0xADDRESS[@rpcUrl]`);
    const [contract, perVenueRpc] = rest.split("@");
    if (!contract) die(`bad --anchors entry "${pair}" — missing contract address`);
    if (!VENUE_CHAINS[venue as VenueId]) {
      die(`unknown venue "${venue}" — one of ${Object.keys(VENUE_CHAINS).join(", ")}`);
    }
    assertAddress(contract, `contract for ${venue}`);
    return { venue: venue as VenueId, contract, rpcUrl: perVenueRpc ?? rpcOverride };
  });

  const tipUrl = flag("tip") ?? DEFAULT_TIP;
  const maxAgeHours = Number(flag("max-age-hours") ?? DEFAULT_MAX_AGE_HOURS);
  console.log("═══ ANCHOR VERIFY ═══\n");
  console.log(`tip     ${tipUrl}`);

  // The record comes from the tip; the venues only hold a digest of it.
  let record: PixelAnchorRecord;
  const pixel = flag("pixel");
  try {
    record = await rpc(tipUrl, "pix_getTipAnchor", pixel === undefined ? [] : [Number(pixel)]);
  } catch (e) {
    die(`could not read pix_getTipAnchor from ${tipUrl}: ${(e as Error).message}`);
  }
  const expected = anchorDigest(record);
  console.log(`pixel   #${record.pixelIndex} on network ${record.networkId}`);
  console.log(`digest  ${expected}\n`);

  const rows: Row[] = [];
  for (const { venue, contract, rpcUrl } of targets) {
    const config = venueConfig({ venue, contract, rpcUrl });
    try {
      // Which height to hold this venue to. Anchoring is periodic, so an
      // unanchored height is the normal case rather than a fault; when no height
      // is named, hold the venue to its own newest claim instead.
      let height = record.pixelIndex;
      let target = record;
      if (pixel === undefined) {
        const newest = await readHighestAnchored(config, record.networkId);
        if (newest === null) {
          rows.push({ venue, contract, status: "absent", detail: "venue holds no anchors at all" });
          continue;
        }
        height = newest;
        target =
          newest === record.pixelIndex
            ? record
            : await rpc<PixelAnchorRecord>(tipUrl, "pix_getTipAnchor", [newest]);
      }

      const onChain = await readAnchor(config, record.networkId, height);
      if (onChain.empty) {
        rows.push({ venue, contract, status: "absent", detail: `nothing anchored at #${height}` });
        continue;
      }

      // Ask the contract itself, so the comparison is not ours to get wrong.
      const want = anchorDigest(target);
      const ok = (await verifyOnChain(config, target)) && onChain.digest === want;
      if (!ok) {
        rows.push({ venue, contract, status: "diverges", detail: `venue holds ${onChain.digest}` });
        continue;
      }

      const behind = record.pixelIndex - height;
      const ageHours = (Date.now() / 1000 - onChain.anchoredAtSec) / 3600;
      const when = new Date(onChain.anchoredAtSec * 1000).toISOString();
      rows.push({
        venue,
        contract,
        behind,
        // A publisher that quietly stopped leaves matching anchors behind, so
        // agreement alone is not health. Age is what catches a stalled job.
        status: ageHours > maxAgeHours ? "stale" : "matches",
        detail:
          `#${height} anchored ${when} by ${onChain.anchorer}` +
          (behind > 0 ? ` — tip is ${behind} ahead` : "") +
          (ageHours > maxAgeHours ? ` — ${Math.floor(ageHours)}h old` : ""),
      });
    } catch (e) {
      rows.push({ venue, contract, status: "unreachable", detail: (e as Error).message });
    }
  }

  const mark = {
    matches: "✓",
    diverges: "✗",
    absent: "·",
    stale: "⌛",
    unreachable: "?",
  } as const;
  for (const r of rows) {
    console.log(`${mark[r.status]} ${r.venue.padEnd(20)} ${r.status.padEnd(12)} ${r.detail}`);
    const chain = VENUE_CHAINS[r.venue]!;
    if (chain.explorer) console.log(`  ${chain.explorer}/address/${r.contract}`);
  }

  const agreed = rows.filter((r) => r.status === "matches").length;
  const label = pixel === undefined ? "on their newest anchor" : `at #${record.pixelIndex}`;
  console.log(`\n${agreed}/${rows.length} venues agree with local history ${label}`);
  // Say plainly where the guarantee stops. Everything past it is unwitnessed.
  const behind = rows.filter((r) => r.behind !== undefined).map((r) => r.behind!);
  if (behind.length > 0 && Math.max(...behind) > 0) {
    console.log(
      `⚠  the tip is #${record.pixelIndex}; nothing after ` +
        `#${record.pixelIndex - Math.min(...behind)} is anchored anywhere yet`,
    );
  }
  for (const w of venueSetWarnings(targets.map((t) => t.venue))) console.log(`⚠  ${w}`);

  const diverged = rows.filter((r) => r.status === "diverges");
  if (diverged.length > 0) {
    console.log(
      "\nDIVERGENCE. Either the tip's history was rewritten, or a venue was given a\n" +
        "false digest. Both are worth investigating immediately; a venue cannot be\n" +
        "corrected, because heights are write-once.",
    );
    process.exit(1);
  }
  const stale = rows.filter((r) => r.status === "stale");
  if (stale.length > 0) {
    console.log(
      `\nSTALE. Every venue still agrees, but the newest anchor is over ${maxAgeHours}h old,\n` +
        "so publishing has stopped. Check the anchorer's gas and the scheduled run.",
    );
    process.exit(1);
  }
  if (agreed !== rows.length) {
    console.log("\nIncomplete: some venues hold nothing or could not be read.");
    process.exit(1);
  }

  console.log("\n═══ PASS — every venue agrees, checked with no keys ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

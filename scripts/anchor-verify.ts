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

import { anchorDigest, type PixelAnchorRecord } from "../src/lib/pixel/anchor";
import { readAnchor, verifyOnChain } from "../src/lib/pixel/anchor-evm";
import {
  VENUE_CHAINS,
  venueConfig,
  venueSetWarnings,
  type VenueId,
} from "../src/lib/pixel/anchor-venues";

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
  status: "matches" | "diverges" | "absent" | "unreachable";
  detail: string;
};

async function main(): Promise<void> {
  const anchorsArg = flag("anchors");
  if (!anchorsArg) {
    die(
      "--anchors is required.\n" +
        "  bun run anchor:verify -- --pixel 12 --anchors robinhood-testnet=0xABC,ethereum-sepolia=0xDEF",
    );
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
      const onChain = await readAnchor(config, record.networkId, record.pixelIndex);
      if (onChain.empty) {
        rows.push({
          venue,
          contract,
          status: "absent",
          detail: `nothing anchored at #${record.pixelIndex}`,
        });
        continue;
      }
      // Ask the contract itself, so the comparison is not ours to get wrong.
      const ok = await verifyOnChain(config, record);
      rows.push({
        venue,
        contract,
        status: ok && onChain.digest === expected ? "matches" : "diverges",
        detail:
          ok && onChain.digest === expected
            ? `anchored ${new Date(onChain.anchoredAtSec * 1000).toISOString()} by ${onChain.anchorer}`
            : `venue holds ${onChain.digest}`,
      });
    } catch (e) {
      rows.push({ venue, contract, status: "unreachable", detail: (e as Error).message });
    }
  }

  const mark = { matches: "✓", diverges: "✗", absent: "·", unreachable: "?" } as const;
  for (const r of rows) {
    console.log(`${mark[r.status]} ${r.venue.padEnd(20)} ${r.status.padEnd(12)} ${r.detail}`);
    const chain = VENUE_CHAINS[r.venue]!;
    if (chain.explorer) console.log(`  ${chain.explorer}/address/${r.contract}`);
  }

  const agreed = rows.filter((r) => r.status === "matches").length;
  console.log(`\n${agreed}/${rows.length} venues agree with the tip`);
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

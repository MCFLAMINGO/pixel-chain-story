#!/usr/bin/env bun
/**
 * Deploy PixelAnchor to a venue and anchor a live tip.
 *
 *   ANCHOR_PRIVATE_KEY=0x… bun run anchor:deploy -- --venue robinhood-testnet
 *
 * Every step that can be checked before spending gas is checked first, with an
 * error that says what to do. The only thing this cannot do for you is fund the
 * key — the Robinhood faucet requires a wallet and a human verification step.
 *
 * Flags
 *   --venue <id>        robinhood-testnet | base-sepolia | ethereum-sepolia | anvil
 *   --tip <url>         Pixel RPC to read the tip from (default: crowned tip)
 *   --pixel <n>         height to anchor (default: latest)
 *   --contract <addr>   reuse an existing deployment instead of deploying
 *   --rpc <url>         override the venue RPC
 *   --dry-run           check everything, spend nothing
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  anchorAction,
  anchorDigest,
  verifyAnchorAgainstChain,
  type PixelAnchorRecord,
} from "../src/lib/pixel/anchor";
import {
  assertChainId,
  castSender,
  evmAnchorVenue,
  readAnchor,
  verifyOnChain,
} from "../src/lib/pixel/anchor-evm";
import {
  VENUE_CHAINS,
  venueConfig,
  venueSetWarnings,
  type VenueId,
} from "../src/lib/pixel/anchor-venues";

const ANCHORS_FILE = "anchors.json";
const DEFAULT_TIP = "https://pixel-tip-production.up.railway.app";
const FOUNDRY = `${process.env.HOME}/.foundry/bin`;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

function die(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function sh(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    env: { ...process.env, PATH: `${FOUNDRY}:${process.env.PATH}` },
  });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}\n${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? "rpc error"}`);
  if (body.result === undefined) throw new Error(`${method}: empty result`);
  return body.result;
}

async function main(): Promise<void> {
  const venue = (flag("venue") ?? "robinhood-testnet") as VenueId;
  const chain = VENUE_CHAINS[venue];
  if (!chain) die(`unknown venue "${venue}" — one of ${Object.keys(VENUE_CHAINS).join(", ")}`);

  const rpcUrl = flag("rpc") ?? chain.rpcUrl;
  const tipUrl = flag("tip") ?? DEFAULT_TIP;
  const dryRun = has("dry-run");

  // Paths below are repo-relative; fail clearly instead of "file not found".
  if (!existsSync("contracts/PixelAnchor.sol")) {
    die(
      `run this from the repository root (currently ${process.cwd()}).\n` +
        "  cd /path/to/pixel-chain-story && bun run anchor:deploy -- --venue <id>",
    );
  }

  console.log("═══ ANCHOR DEPLOY ═══\n");
  console.log(`venue      ${venue} (chain ${chain.chainId}, sequencer ${chain.sequencer})`);
  console.log(`rpc        ${rpcUrl}`);
  console.log(`tip        ${tipUrl}`);
  console.log(`note       ${chain.note}`);
  for (const w of venueSetWarnings([venue])) console.log(`⚠  ${w}`);
  console.log("");

  // 1. Venue reachable and is the chain we think it is.
  await assertChainId(rpcUrl, chain.chainId).catch((e) => die(String((e as Error).message)));
  console.log(`▸ chain id ${chain.chainId} confirmed by the RPC ✓`);

  // 2. The tip hands us its own anchor record, and the digest recomputes.
  let record: PixelAnchorRecord & { digest?: string };
  try {
    const pixel = flag("pixel");
    record = await rpc(tipUrl, "pix_getTipAnchor", pixel === undefined ? [] : [Number(pixel)]);
  } catch (e) {
    die(
      `could not read pix_getTipAnchor from ${tipUrl}: ${(e as Error).message}\n\n` +
        `  A tip on an older build does not expose it, and there is no fallback:\n` +
        `  pix_getBlockByNumber truncates the SHA-512 hash to 32 bytes for display and\n` +
        `  does not return spatialRoot at all, so the header cannot describe an anchor.\n\n` +
        `  Deploy this branch to the tip, then re-run. Verify with:\n` +
        `    curl -s -X POST ${tipUrl} -H 'content-type: application/json' \\\n` +
        `      -d '{"jsonrpc":"2.0","id":1,"method":"pix_getTipAnchor","params":[]}'`,
    );
  }
  const local = anchorDigest(record);
  if (record.digest && record.digest !== local) {
    die(`tip reported digest ${record.digest} but the record recomputes to ${local}`);
  }
  console.log(`▸ tip #${record.pixelIndex} digest ${local.slice(0, 16)}… recomputes ✓`);

  // 3. Resolve the deployment and check whether there is anything to do.
  //    Read-only, so a scheduled run with nothing to publish needs no key.
  let contract = flag("contract");
  // Reuse the committed deployment unless told otherwise, so a scheduled run
  // anchors to the existing contract instead of deploying a new one each time.
  if (!contract && existsSync(ANCHORS_FILE)) {
    const cfg = JSON.parse(readFileSync(ANCHORS_FILE, "utf8")) as {
      venues?: Record<string, string>;
    };
    const known = cfg.venues?.[venue];
    if (known) {
      contract = known;
      console.log(`▸ using ${ANCHORS_FILE} deployment ${contract}`);
    }
  }

  if (contract) {
    const readOnlyPre = venueConfig({ venue, contract, rpcUrl });
    const existing = await readAnchor(readOnlyPre, record.networkId, record.pixelIndex);
    const decision = anchorAction(existing, local);
    if (decision.action === "already-anchored") {
      console.log(
        `▸ #${record.pixelIndex} already anchored at ` +
          `${new Date(decision.anchoredAtSec * 1000).toISOString()} — nothing to do ✓`,
      );
      return;
    }
    if (decision.action === "divergence") {
      die(
        `DIVERGENCE at #${record.pixelIndex} on ${venue}.\n` +
          `  venue holds ${decision.onVenue}\n` +
          `  tip reports ${decision.local}\n` +
          "  Heights are write-once, so this cannot be overwritten. Either the tip's\n" +
          "  history was rewritten or a false digest was published. Investigate before\n" +
          "  anchoring anything further.",
      );
    }
  }

  // 4. Foundry present (used for deploy + signing).
  const cast = `${FOUNDRY}/cast`;
  try {
    sh(cast, ["--version"]);
  } catch {
    die(
      "Foundry not found — install with: curl -L https://foundry.paradigm.xyz | bash && foundryup",
    );
  }

  const pk = process.env.ANCHOR_PRIVATE_KEY;
  if (!pk) {
    die(
      "ANCHOR_PRIVATE_KEY is not set.\n\n" +
        "  1. cast wallet new\n" +
        "  2. export ANCHOR_PRIVATE_KEY=0x<the private key it printed>\n" +
        `  3. fund the address on ${venue}\n\n` +
        "  The key only ever publishes 32-byte digests, so it holds no value — but do\n" +
        "  not reuse a key you use anywhere else, and do not paste it into a chat.\n" +
        "  For CI, store it as a repository or Cloud Agent secret instead of exporting.",
    );
  }
  const address = sh(cast, ["wallet", "address", "--private-key", pk]);
  console.log(`▸ anchorer ${address}`);

  // 5. Funded? This is the step a script cannot do for you.
  const balanceWei = BigInt(sh(cast, ["balance", address, "--rpc-url", rpcUrl]));
  if (balanceWei === 0n) {
    die(
      `${address} has no ETH on ${venue}.\n` +
        (venue.startsWith("robinhood")
          ? "  Fund it at https://faucet.testnet.chain.robinhood.com (wallet + human verification),\n" +
            "  or bridge Sepolia ETH via https://portal.arbitrum.io/bridge\n"
          : "  Fund it from that network's faucet.\n") +
        "  Anchoring costs roughly 98k gas per publish.",
    );
  }
  console.log(`▸ balance ${(Number(balanceWei) / 1e18).toFixed(6)} ETH ✓`);

  if (dryRun) {
    console.log("\n▸ --dry-run: all preconditions pass, nothing spent");
    return;
  }

  // 6. Deploy when there is no existing deployment.
  if (contract && !/^0x[0-9a-fA-F]{40}$/.test(contract)) {
    die(`--contract is not an address: "${contract}" (expected 0x + 40 hex chars)`);
  }
  if (!contract) {
    const out = sh(`${FOUNDRY}/forge`, [
      "create",
      "contracts/PixelAnchor.sol:PixelAnchor",
      "--rpc-url",
      rpcUrl,
      "--private-key",
      pk,
      "--broadcast",
      // Production should deploy a non-zero allowlist delay; 0 for a first artifact.
      "--constructor-args",
      "0",
    ]);
    contract = out.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/)?.[1];
    if (!contract) die(`no deploy address in:\n${out}`);
    console.log(`▸ PixelAnchor deployed ${contract}`);
    sh(cast, [
      "send",
      contract,
      "setAnchorer(address,bool)",
      address,
      "true",
      "--rpc-url",
      rpcUrl,
      "--private-key",
      pk,
    ]);
    console.log("▸ anchorer granted ✓");
  } else {
    console.log(`▸ reusing ${contract}`);
  }

  // 7. Publish through the venue adapter.
  const config = venueConfig({
    venue,
    contract,
    rpcUrl,
    sender: castSender({ rpcUrl, privateKey: pk, castPath: cast }),
  });
  const published = await evmAnchorVenue(config).publish(record);
  console.log(`▸ anchored #${record.pixelIndex} → ${published.reference}`);

  // 8. Verify the way a stranger would: no keys.
  const readOnly = venueConfig({ venue, contract, rpcUrl });
  if (!(await verifyOnChain(readOnly, record))) die("published anchor does not verify on-chain");
  const onChain = await readAnchor(readOnly, record.networkId, record.pixelIndex);
  console.log(
    `▸ verified keylessly; anchored at ${new Date(onChain.anchoredAtSec * 1000).toISOString()} ✓`,
  );

  console.log(`\ncontract   ${contract}`);
  console.log(`digest     ${local}`);
  if (chain.explorer) console.log(`explorer   ${chain.explorer}/address/${contract}`);
  console.log(
    "\nAnchor a second, independent venue before citing this as evidence — one venue\n" +
      "is a single point of failure for both liveness and honesty:\n" +
      `  bun run anchor:deploy -- --venue ethereum-sepolia --pixel ${record.pixelIndex}`,
  );
  console.log("\n═══ DONE ═══");
  void verifyAnchorAgainstChain;
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

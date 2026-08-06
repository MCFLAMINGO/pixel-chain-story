#!/usr/bin/env bun
/**
 * The EVM anchoring venue must actually work on a real EVM.
 *
 * `anchor.ts` shipped with only an in-memory venue, so "adding a venue is a
 * four-field interface" was an untested claim. This deploys PixelAnchor on
 * anvil and drives it through the adapter — hand-rolled ABI encoding included,
 * because that is where this kind of code breaks.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import {
  assertChainId,
  castSender,
  decodeAnchorAt,
  encodeAnchorCall,
  encodeAnchorAtCall,
  encodeMatchesCall,
  evmAnchorVenue,
  readAnchor,
  readHighestAnchored,
  verifyOnChain,
} from "../src/lib/pixel/anchor-evm";
import {
  VENUE_CHAINS,
  anchorVenueThesis,
  venueConfig,
  venueSetWarnings,
} from "../src/lib/pixel/anchor-venues";
import {
  anchorAction,
  anchorDigest,
  buildAnchorFromState,
  compareVenues,
} from "../src/lib/pixel/anchor";
import { createGenesis, proposeTransfer, sequenceBlock } from "../src/lib/pixel/chain";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";

const FOUNDRY = `${process.env.HOME}/.foundry/bin`;
const PATH_ENV = `${FOUNDRY}:${process.env.PATH}`;
const RPC = "http://127.0.0.1:8547";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function sh(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, PATH: PATH_ENV } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}\n${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

async function main(): Promise<void> {
  console.log("═══ EVM ANCHOR VENUE ═══\n");

  // 1. Registry honesty: verified chain IDs, and the caveats travel with them.
  assert(VENUE_CHAINS["robinhood-mainnet"]!.chainId === 4663, "robinhood mainnet chain id");
  assert(VENUE_CHAINS["robinhood-testnet"]!.chainId === 46630, "robinhood testnet chain id");
  assert(
    VENUE_CHAINS["robinhood-mainnet"]!.sequencer === "centralized",
    "robinhood runs a centralized sequencer — the registry must say so",
  );
  console.log("▸ venue registry carries verified chain ids + sequencer posture ✓");

  // A single centralized venue must be reported as insufficient.
  const single = venueSetWarnings(["robinhood-testnet"]);
  assert(single.length === 2, `expected two warnings, got ${JSON.stringify(single)}`);
  const spread = venueSetWarnings(["robinhood-testnet", "ethereum-sepolia"]);
  assert(spread.length === 0, `mixed set should be clean, got ${JSON.stringify(spread)}`);
  console.log("▸ one centralized venue warns; adding an independent one clears it ✓");

  // 2. ABI encoding — selectors and offsets, checked before touching a chain.
  const record = {
    networkId: 20553,
    pixelIndex: 7,
    tipHash: "11".repeat(64),
    spatialRoot: "22".repeat(64),
  };
  const call = encodeAnchorCall(record);
  // selector(4) + 4 head words + 2 x (length word + 64 bytes) = 4 + 128 + 192
  assert(call.length === 2 + (4 + 128 + 192) * 2, `anchor calldata length ${call.length}`);
  assert(call.slice(2, 10) !== encodeMatchesCall(record).slice(2, 10), "selectors must differ");
  assert(
    call.slice(10) === encodeMatchesCall(record).slice(10),
    "matches() takes identical args to anchor()",
  );
  assert(encodeAnchorAtCall(20553, 7).length === 2 + (4 + 64) * 2, "anchorAt calldata length");
  const decoded = decodeAnchorAt(
    `0x${"ab".repeat(32)}${"00".repeat(24)}${"0000000068000000"}${"00".repeat(12)}${"cd".repeat(20)}`,
  );
  assert(decoded.digest === "ab".repeat(32), "digest decode");
  assert(decoded.anchorer.endsWith("cd".repeat(20)), "anchorer decode");
  console.log("▸ ABI encode/decode: selectors, offsets, struct return ✓");

  if (!existsSync(`${FOUNDRY}/anvil`)) {
    console.log("▸ anvil absent — skipping the on-chain leg (CI runs it)");
    return;
  }

  // 3. End-to-end on a real EVM, through the adapter.
  let anvil: ChildProcess | null = null;
  try {
    anvil = spawn(`${FOUNDRY}/anvil`, ["--silent", "--port", "8547"], {
      env: { ...process.env, PATH: PATH_ENV },
      stdio: "ignore",
    });
    await sleep(1200);

    const pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const me = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const out = sh(`${FOUNDRY}/forge`, [
      "create",
      "contracts/PixelAnchor.sol:PixelAnchor",
      "--rpc-url",
      RPC,
      "--private-key",
      pk,
      "--broadcast",
      "--constructor-args",
      "0",
    ]);
    const contract = out.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/)?.[1];
    assert(contract, `no deploy address in:\n${out}`);
    sh(`${FOUNDRY}/cast`, [
      "send",
      contract!,
      "setAnchorer(address,bool)",
      me,
      "true",
      "--rpc-url",
      RPC,
      "--private-key",
      pk,
    ]);
    console.log("▸ PixelAnchor deployed", contract);

    const config = venueConfig({
      venue: "anvil",
      contract: contract!,
      rpcUrl: RPC,
      sender: castSender({ rpcUrl: RPC, privateKey: pk, castPath: `${FOUNDRY}/cast` }),
    });
    await assertChainId(config.rpcUrl, config.chainId);
    console.log("▸ chain id guard agrees with the RPC ✓");

    // A real chain state, anchored through the venue interface.
    const alice = await generatePixelKeypair("PIX-ML-DSA-65");
    const bob = await generatePixelKeypair("PIX-ML-DSA-65");
    let state = await createGenesis(alice);
    ({ state } = await proposeTransfer(state, alice, [{ amount: 4, address: bob.address }], {
      description: "anchor venue lab",
    }));
    state = await sequenceBlock(state, alice);
    const live = buildAnchorFromState(state);

    const venue = evmAnchorVenue(config);
    const published = await venue.publish(live);
    assert(published.digest === anchorDigest(live), "published digest must match the record");
    console.log(`▸ anchored #${live.pixelIndex} via the adapter ✓`);

    // Anyone can verify with no keys at all.
    const readOnly = venueConfig({ venue: "anvil", contract: contract!, rpcUrl: RPC });
    assert(await verifyOnChain(readOnly, live), "the real tip must verify with no signer");
    assert(
      !(await verifyOnChain(readOnly, { ...live, tipHash: "de".repeat(64) })),
      "a rewritten tip must not verify",
    );
    console.log("▸ verification needs no keys; a rewritten tip is rejected ✓");

    const onChain = await readAnchor(readOnly, live.networkId, live.pixelIndex);
    assert(!onChain.empty && onChain.digest === published.digest, "readAnchor digest");
    assert(onChain.anchorer.toLowerCase() === me.toLowerCase(), "anchorer recorded");
    const absent = await readAnchor(readOnly, live.networkId, 999_999);
    assert(absent.empty, "an unanchored height must read as empty");
    console.log("▸ stored digest, anchorer and empty heights read back correctly ✓");

    // Append-only, enforced on-chain.
    let refused = false;
    try {
      await venue.publish(live);
    } catch {
      refused = true;
    }
    assert(refused, "re-anchoring the same height must be refused");
    console.log("▸ append-only: the same height cannot be rewritten ✓");

    // Two venues agreeing is the point.
    const second = await evmAnchorVenue(config).fetch(live.networkId, live.pixelIndex);
    assert(second && second.digest === published.digest, "second read must agree");
    const agreement = compareVenues([published, { ...published, venueId: "second-reader" }]);
    assert(agreement.agreed, "identical digests must agree");
    console.log("▸ independent readers agree on the same digest ✓");

    // Anchoring is periodic, so the answerable question is "what is your newest
    // claim?" — not "is my current tip anchored?", which is normally no.
    assert(
      (await readHighestAnchored(readOnly, live.networkId)) === live.pixelIndex,
      "the newest anchored height must be readable",
    );
    assert(
      (await readHighestAnchored(readOnly, live.networkId + 999)) === null,
      "a network with no anchors must report null, not height 0",
    );
    console.log("▸ newest anchored height reads back; an unanchored network reads null ✓");

    // A venue holding someone else's digest at our height is the case that
    // cannot be fixed by publishing again. Create it for real and confirm the
    // alarm fires rather than a silent re-anchor attempt.
    const falseHeight = live.pixelIndex + 1;
    const falseRecord = { ...live, pixelIndex: falseHeight, tipHash: "ab".repeat(64) };
    await evmAnchorVenue(config).publish(falseRecord);
    const stale = await readAnchor(readOnly, live.networkId, falseHeight);
    const alarm = anchorAction(stale, anchorDigest({ ...falseRecord, tipHash: "cd".repeat(64) }));
    assert(alarm.action === "divergence", `expected divergence, got ${alarm.action}`);
    const benign = anchorAction(stale, anchorDigest(falseRecord));
    assert(benign.action === "already-anchored", "the honest re-run must stay a no-op");
    assert(
      (await readHighestAnchored(readOnly, live.networkId)) === falseHeight,
      "the newest claim must follow the highest anchored height",
    );
    console.log("▸ live divergence detected; an honest re-run is still a no-op ✓");
  } finally {
    if (anvil?.pid) {
      try {
        process.kill(anvil.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }

  const thesis = anchorVenueThesis();
  console.log(`\nrule:         ${thesis.rule}`);
  console.log(`witness only: ${thesis.witnessOnly}`);
  console.log(`caveat:       ${thesis.caveat}`);
  console.log("\n═══ PASS — the venue interface has a real EVM instance ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

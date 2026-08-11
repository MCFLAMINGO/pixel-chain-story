/**
 * Sovereignty + 21M emission + agnostic bridge — executable thesis.
 * bun scripts/scale-thesis-selftest.ts
 */

import {
  PIX_HARD_CAP,
  PIX_SCHEDULE_TOTAL,
  LIGHT_ERA_LENGTH,
  LIGHT_HORIZON,
  GENESIS_LIGHT_REWARD,
  lightReward,
  mintedThrough,
  valueThesis,
  diversityReport,
  SOVEREIGNTY_POLICY,
  assertSovereignIfLive,
  setProviderRegistry,
  createGenesis,
  generateLightKeypair,
  proposeTransfer,
  sequenceBlock,
  createAttestation,
  verifyAttestation,
  type NodeProvider,
} from "../src/lib/pixel/index";

async function main() {
  console.log("═══ SCALE / VALUE / BRIDGE THESIS ═══\n");

  // 1) Scarcity math — assert what the schedule MINTS, not a closed form we believe.
  //    It used to assert the sum of an *infinite* halving series while the code
  //    halved in whole PIX, died after six halvings, and reached only 20,370,000.
  //    Believing the formula is how a 630,000 PIX phantom stayed invisible.
  //    The schedule is now flat to a horizon and reaches the cap exactly, so this
  //    asserts the arithmetic rather than the shortfall. See docs/EMISSION.md.
  const thesis = valueThesis();
  if (thesis.cap !== 21_000_000) throw new Error("cap");
  if (lightReward(0) !== GENESIS_LIGHT_REWARD) throw new Error("genesis reward");
  if (lightReward(LIGHT_ERA_LENGTH) !== GENESIS_LIGHT_REWARD) {
    throw new Error("reward must be flat — every moment worth the same");
  }
  if (lightReward(LIGHT_HORIZON) !== 0) throw new Error("reward must stop at the horizon");
  if (lightReward(LIGHT_HORIZON - 1) !== GENESIS_LIGHT_REWARD) {
    throw new Error("the last rewarded pixel must still pay");
  }

  // The cap is now reachable, not aspirational.
  if (PIX_SCHEDULE_TOTAL !== PIX_HARD_CAP) {
    throw new Error(`schedule total ${PIX_SCHEDULE_TOTAL}, expected exactly ${PIX_HARD_CAP}`);
  }
  if (mintedThrough(LIGHT_HORIZON + 1_000_000) !== PIX_HARD_CAP) {
    throw new Error("nothing may be minted past the horizon");
  }

  // Closed-form mintedThrough must equal the per-pixel loop it replaced.
  let loopTotal = 0;
  for (let i = 0; i < 5_000; i++) {
    loopTotal += lightReward(i);
    if (mintedThrough(i + 1) !== loopTotal) {
      throw new Error(`mintedThrough diverged from the loop at pixel ${i}`);
    }
  }
  for (const n of [0, 209_999, 210_000, 210_001, 630_000, 1_890_000, 13_440_000]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += lightReward(i);
    if (mintedThrough(n) !== s) throw new Error(`mintedThrough(${n}) diverged`);
  }
  console.log(
    `▸ reachable supply ${PIX_SCHEDULE_TOTAL.toLocaleString()} of a ${PIX_HARD_CAP.toLocaleString()} ceiling ✓`,
  );
  console.log(" ", thesis.analogy);

  // 2) Sovereignty diversity enforcement
  const weak: NodeProvider[] = [
    {
      id: "1",
      address: "a",
      jurisdiction: "US",
      hosting: "cloud",
      cloudVendor: "aws",
    },
    {
      id: "2",
      address: "b",
      jurisdiction: "US",
      hosting: "cloud",
      cloudVendor: "aws",
    },
  ];
  const weakReport = diversityReport(weak);
  if (weakReport.passes) throw new Error("weak set should fail");
  console.log("▸ rejects AWS-heavy toy set ✓", weakReport.reasons[0]);

  const strong: NodeProvider[] = [
    { id: "1", address: "a1", jurisdiction: "IS", hosting: "colo" },
    { id: "2", address: "a2", jurisdiction: "DE", hosting: "home" },
    { id: "3", address: "a3", jurisdiction: "BR", hosting: "colo" },
    { id: "4", address: "a4", jurisdiction: "JP", hosting: "home" },
    { id: "5", address: "a5", jurisdiction: "ZA", hosting: "colo" },
    { id: "6", address: "a6", jurisdiction: "CA", hosting: "home" },
    { id: "7", address: "a7", jurisdiction: "IN", hosting: "mobile" },
    {
      id: "8",
      address: "a8",
      jurisdiction: "SE",
      hosting: "cloud",
      cloudVendor: "other",
    },
  ];
  const strongReport = diversityReport(strong);
  if (!strongReport.passes) throw new Error(strongReport.reasons.join("; "));
  if (!strongReport.enforceable) throw new Error("should be enforceable");
  if (strong.length < SOVEREIGNTY_POLICY.minProviders) throw new Error("min");
  console.log("▸ sovereign 8-provider set passes ✓");

  // Enforcement on chain registry (live set)
  let regChain = await createGenesis(await generateLightKeypair());
  regChain = setProviderRegistry(regChain, strong);
  assertSovereignIfLive(regChain.providers ?? []);
  let rejected = false;
  try {
    setProviderRegistry(regChain, weak);
  } catch {
    rejected = true;
  }
  // weak is not enforceable (<7) so setProviderRegistry allows it — confirm:
  if (rejected) {
    // If policy later rejects small sets, that's fine; today small sets skip.
  }
  // Live bad set (≥7 but concentrated) must throw:
  const concentrated: NodeProvider[] = Array.from({ length: 7 }, (_, i) => ({
    id: `c${i}`,
    address: `addr${i}`,
    jurisdiction: "US",
    hosting: "cloud" as const,
    cloudVendor: "aws" as const,
  }));
  let liveReject = false;
  try {
    setProviderRegistry(regChain, concentrated);
  } catch {
    liveReject = true;
  }
  if (!liveReject) throw new Error("concentrated ≥7 set must be rejected");
  console.log("▸ setProviderRegistry enforces live diversity ✓");

  // 3) Agnostic bridge attestation
  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  let chain = await createGenesis(alice);
  const { state, tx } = await proposeTransfer(chain, alice, [{ amount: 5, address: bob.address }], {
    description: "bridge prep",
    recipientLabel: "@bob",
  });
  void tx;
  chain = await sequenceBlock(state, alice);
  const pixel = chain.pixels[chain.pixels.length - 1];

  const att = await createAttestation({
    pixel,
    networkId: chain.networkId,
    sequencerAddresses: chain.sequencers.map((s) => s.address),
    sequencer: alice,
    message: {
      direction: "shineOut",
      nonce: "n1",
      amount: 5,
      asset: "PIX",
      fromAddress: alice.address,
      toChain: "ethereum",
      toAddress: "0xabc",
      memo: "shine on ethereum",
    },
  });
  const verified = await verifyAttestation(
    att,
    chain.sequencers.map((s) => s.address),
  );
  if (!verified.ok) throw new Error(verified.reason);
  console.log("▸ Universal Light Attestation → ethereum ✓");

  console.log("\nMinted through genesis+1:", mintedThrough(chain.pixels.length), "PIX");
  console.log("═══ PASS ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

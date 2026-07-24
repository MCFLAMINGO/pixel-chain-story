/**
 * Gate F — headers-first sync, balance merkle proofs, peer hello auth + scoring.
 * bun scripts/light-client-selftest.ts
 */
import {
  buildHeadersSync,
  createGenesis,
  createPeerBook,
  generateLightKeypair,
  lightBalanceCheck,
  notePeerHello,
  proveBalance,
  proposeTransfer,
  punishPeer,
  sequenceBlock,
  shouldAcceptTipFromPeer,
  signHello,
  verifyBalanceProof,
  verifyHeaderChain,
  verifyHelloAuth,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ GATE F — LIGHT CLIENT ═══\n");

  const alice = await generateLightKeypair();
  const bob = await generateLightKeypair();
  let state = await createGenesis(alice);
  ({ state } = await proposeTransfer(state, alice, [{ amount: 7, address: bob.address }], {
    description: "gate-f",
    recipientLabel: "@bob",
  }));
  state = await sequenceBlock(state, alice);

  // Headers-first
  const pkg = await buildHeadersSync(state);
  if (pkg.headers.length !== state.pixels.length) throw new Error("header count");
  if (pkg.genesisHash !== state.pixels[0]!.hash) throw new Error("genesisHash in headers sync");
  const hOk = await verifyHeaderChain(
    pkg.headers,
    state.sequencers.map((s) => s.address),
  );
  if (!hOk.ok) throw new Error(`headers: ${hOk.reason}`);
  console.log(
    "▸ headers-first chain verify ✓ tip",
    pkg.tip,
    "canvas",
    pkg.genesisHash.slice(0, 12) + "…",
    "stateRoot",
    pkg.stateRoot.slice(0, 16) + "…",
  );

  // Tampered header fails
  const bad = structuredClone(pkg.headers);
  bad[1] = { ...bad[1], prevHash: "ff".repeat(64) };
  const badH = await verifyHeaderChain(bad);
  if (badH.ok) throw new Error("tampered headers must fail");
  console.log("▸ tampered header rejected ✓");

  // Balance proof
  const proof = await proveBalance(state, bob.address);
  if (!proof || proof.amount !== 7) throw new Error(`bob proof amount ${proof?.amount}`);
  if (!(await verifyBalanceProof(proof))) throw new Error("bob proof verify");
  if (proof.stateRoot !== pkg.stateRoot) throw new Error("proof stateRoot ≠ tip");
  const light = await lightBalanceCheck(pkg, proof);
  if (!light.ok || light.amount !== 7) throw new Error(`light check ${light.reason}`);
  console.log("▸ balance merkle proof bob=7 ✓");

  // Forged amount fails
  const forged = { ...proof, amount: 999 };
  if (await verifyBalanceProof(forged)) throw new Error("forged amount must fail");
  console.log("▸ forged balance proof rejected ✓");

  // Zero / absent address
  const ghost = await generateLightKeypair();
  const zero = await proveBalance(state, ghost.address);
  if (!zero || zero.amount !== 0 || zero.leafIndex !== -1) throw new Error("zero proof");
  console.log("▸ absent address amount=0 proof ✓");

  // Peer hello auth
  const tipHash = pkg.tipHash;
  const gossipUrl = "ws://127.0.0.1:19099/gossip";
  const sig = await signHello(alice, pkg.tip, tipHash, gossipUrl);
  const authOk = await verifyHelloAuth({
    address: alice.address,
    publicKey: alice.publicKey,
    tip: pkg.tip,
    tipHash,
    gossipUrl,
    signature: sig,
  });
  if (!authOk) throw new Error("hello auth failed");
  const authBad = await verifyHelloAuth({
    address: alice.address,
    publicKey: alice.publicKey,
    tip: pkg.tip,
    tipHash: "00".repeat(64),
    gossipUrl,
    signature: sig,
  });
  if (authBad) throw new Error("bad tipHash hello must fail");
  console.log("▸ signed hello verify ✓");

  // Scoring / eclipse
  const book = createPeerBook();
  notePeerHello(book, "ws://honest", {
    address: alice.address,
    publicKey: alice.publicKey,
    tip: pkg.tip,
    tipHash,
    helloOk: true,
  });
  notePeerHello(book, "ws://liar", {
    address: bob.address,
    publicKey: bob.publicKey,
    tip: pkg.tip,
    tipHash: "ab".repeat(64),
    helloOk: true,
  });
  punishPeer(book, "ws://liar", 5);
  const deny = shouldAcceptTipFromPeer(book, "ws://liar", {
    tip: pkg.tip,
    tipHash: "ab".repeat(64),
  });
  if (deny.accept) throw new Error("liar tip must be rejected when honest peer disagrees");
  const allow = shouldAcceptTipFromPeer(book, "ws://honest", {
    tip: pkg.tip,
    tipHash,
  });
  if (!allow.accept) throw new Error("honest tip must be accepted");
  console.log("▸ eclipse guard: liar rejected, honest accepted ✓");

  console.log("\n═══ PASS — Gate F light client primitives ═══");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

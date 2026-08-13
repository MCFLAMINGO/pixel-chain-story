#!/usr/bin/env bun
/**
 * The wallet carries the picture.
 *
 * Proves the copy is real and that it refuses to become a different one:
 *   1. An empty wallet takes the whole chain and holds it.
 *   2. A later sync takes only what is new — it does not refetch history.
 *   3. A feed that does not chain is refused, and the held copy is untouched.
 *   4. A different Earth is refused even when it chains internally.
 *   5. An unreachable tip changes nothing.
 *   6. The copy exports as something a person could hand back.
 */

import {
  createGenesis,
  proposeTransfer,
  sequenceBlock,
  type LedgerPixel,
} from "../src/lib/pixel/chain";
import {
  exportMirror,
  exportMirrorHtml,
  mirrorState,
  mirrorThesis,
  syncMirror,
  type MirrorStore,
} from "../src/lib/pixel/chain-mirror";
import { generatePixelKeypair } from "../src/lib/pixel/scheme";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
}

console.log("═══ CHAIN MIRROR ═══\n");

// A real chain to mirror.
const alice = await generatePixelKeypair("PIX-ML-DSA-65");
const bob = await generatePixelKeypair("PIX-ML-DSA-65");
let chain = await createGenesis(alice);
for (let i = 0; i < 3; i++) {
  ({ state: chain } = await proposeTransfer(chain, alice, [{ amount: 1, address: bob.address }], {
    description: `moment ${i + 1}`,
  }));
  chain = await sequenceBlock(chain, alice);
}
const truth = chain.pixels;
assert(truth.length === 4, `expected 4 pixels, got ${truth.length}`);

// A wallet's storage, and a tip that serves ?since= the way the node does.
let saved: LedgerPixel[] | null = null;
const store: MirrorStore = {
  load: async () => saved,
  save: async (p) => void (saved = p),
};
let served: LedgerPixel[] = truth;
const tip: typeof fetch = async (url) => {
  const since = Number(new URL(String(url)).searchParams.get("since") ?? "-1");
  const body = served.filter((p) => p.index > since);
  return new Response(JSON.stringify(body), { status: 200 }) as Response;
};

// 1. An empty wallet takes the whole picture.
const first = await syncMirror({ rpcBase: "http://tip", store, fetchImpl: tip });
assert(first.ok && first.added === 4, `first sync should take 4, got ${JSON.stringify(first)}`);
assert(saved?.length === 4, "the copy must be stored");
const held = mirrorState(saved!);
console.log(
  `▸ empty wallet took the whole picture: ${held.height + 1} pixels, ${held.bytes} bytes ✓`,
);

// 2. A later sync takes only what is new.
({ state: chain } = await proposeTransfer(chain, alice, [{ amount: 1, address: bob.address }], {
  description: "a new moment",
}));
chain = await sequenceBlock(chain, alice);
served = chain.pixels;
const second = await syncMirror({ rpcBase: "http://tip", store, fetchImpl: tip });
assert(second.ok && second.added === 1, `second sync should take 1, got ${JSON.stringify(second)}`);
assert(saved?.length === 5, "the copy must grow to 5");
console.log("▸ a later sync took only the new pixel, not the history again ✓");

// 3. A feed that does not chain is refused, and the copy survives untouched.
const before = saved!.length;
const bogus = { ...truth[1]!, index: 9, prevHash: "de".repeat(64) } as LedgerPixel;
served = [bogus];
const broken = await syncMirror({ rpcBase: "http://tip", store, fetchImpl: tip });
assert(!broken.ok, "a feed that does not chain must be refused");
assert(saved!.length === before, "a refused sync must not touch the held copy");
console.log(`▸ a feed that does not chain is refused (${!broken.ok ? broken.reason : ""}) ✓`);

// 4. A different Earth is refused even though it chains perfectly on its own.
const other = await generatePixelKeypair("PIX-ML-DSA-65");
const otherChain = await createGenesis(other);
saved = null;
served = otherChain.pixels;
const wrong = await syncMirror({
  rpcBase: "http://tip",
  store,
  fetchImpl: tip,
  expectGenesis: truth[0]!.hash,
});
assert(
  !wrong.ok && wrong.reason === "wrong-earth",
  `expected wrong-earth, got ${JSON.stringify(wrong)}`,
);
assert(saved === null, "a wrong Earth must not be stored");
console.log("▸ a different Earth is refused even though it chains internally ✓");

// 5. An unreachable tip changes nothing.
saved = [...truth];
const dead = await syncMirror({
  rpcBase: "http://tip",
  store,
  fetchImpl: async () => {
    throw new Error("network down");
  },
});
assert(!dead.ok && dead.reason === "unreachable", "an unreachable tip must report unreachable");
assert(saved.length === truth.length, "an unreachable tip must not disturb the copy");
console.log("▸ an unreachable tip leaves the copy alone ✓");

// 6. The copy is something a person could hand back.
const file = exportMirror(saved);
const parsed = JSON.parse(file) as { pixelMirror: number; height: number; pixels: LedgerPixel[] };
assert(parsed.pixelMirror === 1, "the export must identify itself");
assert(parsed.pixels.length === saved.length, "the export must carry every pixel held");
assert(parsed.height === saved[saved.length - 1]!.index, "the export must state its height");
console.log(`▸ exports as a file carrying all ${parsed.pixels.length} pixels ✓`);

// 7. And as a picture that opens itself. Data nobody can look at is not a copy of
//    a picture; a file that needs our website is only as durable as our website.
const html = exportMirrorHtml(saved);
assert(html.startsWith("<!doctype html>"), "the export must be a document");
assert(!/src=|href=|@import|fetch\(|XMLHttpRequest/.test(html), "it must load nothing external");
assert(!/https?:\/\//.test(html), "it must reference no URL at all");
for (const p of saved) {
  assert(html.includes(`{"i":${p.index}`), `pixel #${p.index} must be in the file`);
}
assert(html.includes("needs no server"), "it should say what it is");
// The file must carry the record, not only what it looked like. A picture with no
// record inside it is a picture *of* the picture — a visitor could see it and
// decode nothing.
const recordTag = html.match(/id="pixel-record">([\s\S]*?)<\/script>/);
assert(recordTag, "the file must carry the record in a pixel-record tag");
const archived = JSON.parse(recordTag![1]!) as LedgerPixel[];
assert(archived.length === saved.length, "every pixel must be archived, not just drawn");
for (const p of saved) {
  const a = archived.find((x) => x.index === p.index)!;
  assert(a.hash === p.hash, `#${p.index} hash must survive the export`);
  assert(
    a.transactions.length === p.transactions.length,
    `#${p.index} must keep its transactions, not just its colour`,
  );
}
console.log(`▸ carries the whole record: ${archived.length} pixels with transactions ✓`);

console.log(`▸ opens itself: ${(html.length / 1024).toFixed(1)} KB, no external reference ✓`);

const t = mirrorThesis();
console.log(`\nwhy:     ${t.why}`);
console.log(`cannot:  ${t.cannot}`);
console.log(`limit:   ${t.limit}`);
console.log("\n═══ PASS — the picture can survive the server ═══");

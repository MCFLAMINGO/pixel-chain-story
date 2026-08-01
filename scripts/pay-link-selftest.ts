#!/usr/bin/env bun
import { extractPayAddress, payFaceShareUrl } from "../src/lib/pixel/pay-link";

const addr = "pix1ff98c57ba1fe081154a1697ad15e6bddc4d3de";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(extractPayAddress(addr) === addr, "bare");
assert(extractPayAddress(addr.toUpperCase()) === addr, "case");
assert(extractPayAddress(`pay me ${addr} please`) === addr, "embedded");
const url = payFaceShareUrl(addr, "https://pixelledger.org");
assert(url.includes("tab=send") && url.includes(`to=${addr}`), "share url");
assert(extractPayAddress(url) === addr, "from url");
assert(extractPayAddress("https://evil.example/?to=not-a-pix") === null, "reject junk");
assert(extractPayAddress("") === null, "empty");

console.log("OK pay-link");

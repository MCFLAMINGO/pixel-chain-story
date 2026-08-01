#!/usr/bin/env bun
/**
 * public/optical-profile.json must match typed PXP1 / PXP1-P constants.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { opticalProfileDocument, pxp1Profile } from "../src/lib/pixel/optical-profile";
import { PAY_FACE_OPTICAL_MAGIC, PAY_FACE_TRANSPORT } from "../src/lib/pixel/pay-face-optical";
import { OPTICAL_BYTES, OPTICAL_GRID } from "../src/lib/pixel/optical";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const root = join(import.meta.dirname, "..");
const paths = [
  join(root, "public/optical-profile.json"),
  join(root, "public/.well-known/optical-profile.json"),
];

const expected = opticalProfileDocument();
const expectedJson = JSON.stringify(expected);

for (const p of paths) {
  const raw = readFileSync(p, "utf8");
  const doc = JSON.parse(raw) as ReturnType<typeof opticalProfileDocument>;
  assert(JSON.stringify(doc) === expectedJson, `mismatch vs opticalProfileDocument(): ${p}`);
  const p1 = doc.profiles[0]!;
  assert(p1.id === "PXP1", "id");
  assert(p1.grid === OPTICAL_GRID, "grid");
  assert(p1.payloadBytes === OPTICAL_BYTES, "payloadBytes");
  assert(
    p1.magic.every((b, i) => b === PAY_FACE_OPTICAL_MAGIC[i]),
    "magic bytes",
  );
  assert(p1.vault === false, "vault never projected");
  const phys = p1.transports.find((t) => t.id === PAY_FACE_TRANSPORT);
  assert(phys?.default === true && phys.projectable === true, "PXP1-P default projectable");
  assert(phys?.paint === "binary", "binary paint");
  const amp = p1.transports.find((t) => t.id === "PXP1-A");
  assert(amp?.projectable === false, "amplitude not projectable");
  assert(p1.registration.marks === "quiet_zone_only", "quiet zone");
  assert(p1.envelope.binaryFailBlurPx > p1.envelope.binaryExactBlurPx, "blur envelope");
}

const live = pxp1Profile();
assert(live.address.bodyBytes === 19, "body 19");
assert(live.unknownMagic === "ignore_or_upgrade", "unknown magic policy");

console.log("OK optical-profile");

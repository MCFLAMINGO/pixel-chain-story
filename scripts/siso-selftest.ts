/**
 * Come Into the Light — no parallel rewrite.
 * bun scripts/siso-selftest.ts
 */

import {
  acceptIntoLight,
  canServeWithoutOrigin,
  comeTowardLight,
  digestBytes,
  markOriginDark,
  sisoThesis,
} from "../src/lib/pixel/index";

async function main() {
  console.log("═══ SISO CONTINUITY ═══\n");
  const thesis = sisoThesis();
  console.log(thesis.vsIcp);
  console.log(thesis.awsFailure);

  // "Facebook" built on AWS in TypeScript — NOT rewritten for Pixel
  const bundle = await digestBytes("fake-facebook-build-artifact-v1");
  let record = await comeTowardLight({
    name: "example-social",
    kind: "container_image",
    digest: bundle,
    languages: ["typescript", "python"],
    originHost: "aws",
    originUrl: "https://example.aws.amazon.com/app",
    mirrors: ["ipfs://bafy-example", "https://peer.example/mirror/app"],
  });
  if (record.state !== "in_superposition") throw new Error("expected superposition");

  record = acceptIntoLight(record, 42);
  if (record.state !== "in_the_light") throw new Error("expected in the light");
  if (!canServeWithoutOrigin(record)) throw new Error("should be servable");

  record = markOriginDark(record);
  if (record.state !== "origin_dark") throw new Error("expected origin_dark");
  if (!canServeWithoutOrigin(record)) throw new Error("must survive AWS outage");

  console.log("\n▸ AWS-hosted app came into the light without rewrite ✓");
  console.log("▸ Origin marked dark; mirrors still serve ✓");
  console.log("═══ PASS ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

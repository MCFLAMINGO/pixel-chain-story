/**
 * Optical is not theater — raster decode round-trip (same path as camera).
 * bun scripts/optical-selftest.ts
 */

import {
  captureFromRaster,
  encodeHexAsLight,
  isPhysicalOpticalCapture,
  patternToRaster,
  verifyOpticalCapture,
} from "../src/lib/pixel";

async function main() {
  console.log("═══ OPTICAL CAPTURE ═══\n");

  const pattern = await encodeHexAsLight("ab".repeat(32));
  const raster = patternToRaster(pattern, 16);
  const capture = captureFromRaster(raster, "imageData");
  if (!isPhysicalOpticalCapture(capture)) throw new Error("must be physical path");
  if (capture.cells.length !== 256) throw new Error("grid size");

  const verified = await verifyOpticalCapture(capture, pattern.checksum);
  if (!verified.ok || !verified.payload) throw new Error("round-trip failed");
  console.log("▸ pattern → raster → sampleGrid → verify ✓");
  console.log("▸ source:", capture.source);

  // Mutate an entire cell block → fail (single-pixel noise is averaged out)
  const scale = 16;
  for (let y = 0; y < scale; y++) {
    for (let x = 0; x < scale; x++) {
      const i = (y * raster.width + x) * 4;
      raster.data[i] = 255 - raster.data[i];
      raster.data[i + 1] = raster.data[i];
      raster.data[i + 2] = raster.data[i];
    }
  }
  const bad = captureFromRaster(raster, "imageData");
  const badV = await verifyOpticalCapture(bad, pattern.checksum);
  if (badV.ok) throw new Error("corrupt raster should fail");
  console.log("▸ corrupt cell block rejected ✓");

  console.log("\n═══ PASS — optical decode is real ═══");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

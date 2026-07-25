import { readFileSync } from "node:fs";
import { runLumen } from "../src/lumen/repl";

async function main() {
  const prog = readFileSync("src/lumen/example.lumen", "utf8");
  const out = runLumen(prog);
  console.log("LUMEN REPL output:", out);
  // simple asserts
  if (out[0] !== "5") {
    console.error("Expected first print to be 5, got", out[0]);
    process.exit(2);
  }
  if (out[1] !== "50") {
    console.error("Expected second print to be 50, got", out[1]);
    process.exit(2);
  }
  console.log("lumen-selftest: PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

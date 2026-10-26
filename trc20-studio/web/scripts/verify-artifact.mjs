// Build guard: refuses to build if the contract bytecode differs from the audited, tested build.
import { createHash } from "crypto";
import { readFileSync } from "fs";

const EXPECTED = "c5462790d1c92c69d4aad977ffb3f565c780cec65dfbc92fe10174dc1ef0efbb";
const a = JSON.parse(readFileSync(new URL("../src/contracts/StudioTRC20.json", import.meta.url), "utf8"));
const got = createHash("sha256").update(a.bytecode).digest("hex");
if (got !== EXPECTED || a.bytecodeSha256 !== EXPECTED) {
  console.error(`Contract bytecode mismatch. expected ${EXPECTED}, got ${got}`);
  process.exit(1);
}
console.log("Contract bytecode verified:", got);

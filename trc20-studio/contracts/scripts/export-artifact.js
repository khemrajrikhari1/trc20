// Copies the compiled ABI + bytecode into the web app so the deploy wizard can use it.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const src = path.join(__dirname, "../artifacts/contracts/StudioTRC20.sol/StudioTRC20.json");
const dest = path.join(__dirname, "../../web/src/contracts/StudioTRC20.json");
const a = JSON.parse(fs.readFileSync(src, "utf8"));
const bytecode = a.bytecode.replace(/^0x/, "");
const out = {
  contractName: a.contractName,
  compiler: "solc 0.8.20, optimizer 200 runs, evmVersion london",
  bytecodeSha256: crypto.createHash("sha256").update(bytecode).digest("hex"),
  abi: a.abi,
  bytecode,
};
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log("Artifact written to", dest, "sha256:", out.bytecodeSha256);

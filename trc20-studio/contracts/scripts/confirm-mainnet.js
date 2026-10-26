// Hard stop before any CLI mainnet deployment.
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("\n⚠  You are about to deploy to TRON MAINNET. This spends real TRX and cannot be undone.");
console.log("   Make sure you already deployed and tested the same settings on Nile or Shasta.\n");
rl.question('Type "DEPLOY TO MAINNET" to continue: ', (a) => {
  rl.close();
  if (a.trim() !== "DEPLOY TO MAINNET") { console.log("Cancelled."); process.exit(1); }
});

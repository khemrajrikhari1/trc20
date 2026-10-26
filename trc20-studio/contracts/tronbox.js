require("dotenv").config();
// Private keys are read ONLY from your local .env for CLI deployments.
// The web app never touches keys — users sign in TronLink.
module.exports = {
  networks: {
    nile: {
      privateKey: process.env.PRIVATE_KEY_NILE,
      userFeePercentage: 100,
      feeLimit: 1_000_000_000,
      fullHost: "https://nile.trongrid.io",
      network_id: "3",
    },
    shasta: {
      privateKey: process.env.PRIVATE_KEY_SHASTA,
      userFeePercentage: 100,
      feeLimit: 1_000_000_000,
      fullHost: "https://api.shasta.trongrid.io",
      network_id: "2",
    },
    mainnet: {
      privateKey: process.env.PRIVATE_KEY_MAINNET,
      userFeePercentage: 100,
      feeLimit: 1_000_000_000,
      fullHost: "https://api.trongrid.io",
      network_id: "1",
    },
  },
  compilers: { solc: { version: "0.8.20", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "london" } } },
};

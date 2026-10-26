require("@nomicfoundation/hardhat-toolbox");

// Hardhat is used only for fast local unit tests (TVM executes the same Solidity semantics).
// Real deployments go through TronBox (tronbox.js) or the web app's TronLink wizard.
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // "london" avoids the PUSH0 opcode so bytecode is safe on the TRON Virtual Machine.
      evmVersion: "london",
    },
  },
};

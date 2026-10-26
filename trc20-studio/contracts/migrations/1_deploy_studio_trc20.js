const StudioTRC20 = artifacts.require("StudioTRC20");

// Edit these or pass via env. Supply is in WHOLE tokens; scaled by decimals below.
const NAME = process.env.TOKEN_NAME || "Acme Points";
const SYMBOL = process.env.TOKEN_SYMBOL || "ACME";
const DECIMALS = Number(process.env.TOKEN_DECIMALS || 6);
const SUPPLY = BigInt(process.env.TOKEN_SUPPLY || "1000000");
const MINTABLE = process.env.TOKEN_MINTABLE === "true";
const CAP = BigInt(process.env.TOKEN_CAP || "0");

module.exports = async function (deployer, network) {
  const scale = 10n ** BigInt(DECIMALS);
  await deployer.deploy(
    StudioTRC20, NAME, SYMBOL, DECIMALS,
    (SUPPLY * scale).toString(), MINTABLE, (CAP * scale).toString()
  );
  const t = await StudioTRC20.deployed();
  console.log(`\n[${network}] StudioTRC20 deployed at ${t.address}`);
  console.log("Record this address + tx hash in DEPLOYMENTS.md and verify source on TRONSCAN.\n");
};

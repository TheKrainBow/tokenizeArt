// Publishes the Solidity source on Sepolia Etherscan (needs ETHERSCAN_API_KEY).
//   COLLECTION=nft | inscriptions
const hre = require("hardhat");
const { getCollection, loadDeployment } = require("./common.cjs");

async function main() {
  if (!process.env.ETHERSCAN_API_KEY) throw new Error("Missing ETHERSCAN_API_KEY in .env");

  const collection = getCollection();
  const deployed = loadDeployment()[collection.key];
  if (!deployed) throw new Error(`${collection.contractName} is not deployed on ${hre.network.name}`);

  console.log(`Verifying ${collection.contractName}:`, deployed.address);
  try {
    await hre.run("verify:verify", {
      address: deployed.address,
      contract: `contracts/${collection.contractName}.sol:${collection.contractName}`,
      constructorArguments: [deployed.artist],
    });
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    if (!message.toLowerCase().includes("already verified")) throw e;
    console.log("Already verified.");
  }
  console.log(`https://sepolia.etherscan.io/address/${deployed.address}#code`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

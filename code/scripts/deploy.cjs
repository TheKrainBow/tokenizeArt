// Deploys one collection and records its address in deployment/<network>.json.
//   COLLECTION=nft          -> Mokko42NFT (mandatory, IPFS)
//   COLLECTION=inscriptions -> Mokko42Inscriptions (bonus, on-chain)
const hre = require("hardhat");
const { getCollection, loadDeployment, saveDeployment, getWallet, explorerLinks } = require("./common.cjs");

async function main() {
  const collection = getCollection();
  const artist = process.env.ARTIST_LOGIN || (hre.network.name === "sepolia" ? "" : "local-artist");
  if (!artist) throw new Error("Missing ARTIST_LOGIN in .env (your 42 login)");

  const deployer = await getWallet(1);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Network:  ", hre.network.name);
  console.log("Deployer: ", deployer.address);
  console.log("ETH:      ", hre.ethers.formatEther(balance));
  console.log("Artist:   ", artist);
  console.log("");

  const factory = await hre.ethers.getContractFactory(collection.contractName, deployer);
  console.log(`Deploying ${collection.contractName}...`);
  const contract = await factory.deploy(artist);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`${collection.contractName} deployed to:`, address);

  // Saved before any other read: a lagging public RPC node may not see the new code yet
  const deployment = loadDeployment();
  deployment.network = hre.network.name;
  deployment.chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  deployment[collection.key] = {
    contract: collection.contractName,
    address,
    owner: deployer.address,
    artist,
    deployTx: contract.deploymentTransaction().hash,
    deployedAt: new Date().toISOString(),
    tokens: [],
  };
  saveDeployment(deployment);

  console.log("Collection:", await contract.name(), `(${await contract.symbol()})`);
  console.log("Owner:     ", await contract.owner());

  for (const link of explorerLinks(address)) console.log(link);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

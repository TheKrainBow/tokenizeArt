// Helpers shared by the Hardhat scripts (deploy, mint, show, transfer...).
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ quiet: true });
const { privateKeyFromEnv } = require("./private_key.cjs");

const REPO_ROOT = path.join(__dirname, "..", "..");
const DEPLOYMENT_DIR = path.join(REPO_ROOT, "deployment");

// COLLECTION=nft (mandatory, IPFS) or COLLECTION=inscriptions (bonus, on-chain)
const COLLECTIONS = {
  nft: { contractName: "Mokko42NFT", key: "nft" },
  inscriptions: { contractName: "Mokko42Inscriptions", key: "inscriptions" },
};

function getCollection() {
  const name = process.env.COLLECTION || "nft";
  const collection = COLLECTIONS[name];
  if (!collection) throw new Error(`Unknown COLLECTION: ${name} (use nft or inscriptions)`);
  return collection;
}

function deploymentFile() {
  return path.join(DEPLOYMENT_DIR, `${hre.network.name}.json`);
}

function loadDeployment() {
  const file = deploymentFile();
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { network: hre.network.name };
}

function saveDeployment(deployment) {
  fs.mkdirSync(DEPLOYMENT_DIR, { recursive: true });
  fs.writeFileSync(deploymentFile(), JSON.stringify(deployment, null, 2) + "\n");
  console.log("Saved:", path.relative(REPO_ROOT, deploymentFile()));
}

// Wallet 1 = PRIVATE_KEY (deployer / contract owner), wallet 2 = PRIVATE_KEY2 (another user).
// On a local Hardhat network, the default funded test accounts are used instead.
async function getWallet(index) {
  if (hre.network.name === "localhost" || hre.network.name === "hardhat") {
    return (await hre.ethers.getSigners())[index - 1];
  }
  const envName = index === 1 ? "PRIVATE_KEY" : `PRIVATE_KEY${index}`;
  return new hre.ethers.Wallet(privateKeyFromEnv(envName), hre.ethers.provider);
}

// Returns the deployed contract of the current COLLECTION, connected to `signer`.
async function getDeployedContract(collection, signer) {
  const deployment = loadDeployment();
  const address = deployment[collection.key] && deployment[collection.key].address;
  if (!address) {
    throw new Error(`${collection.contractName} is not deployed on ${hre.network.name}. Run the deploy target first.`);
  }
  const factory = await hre.ethers.getContractFactory(collection.contractName, signer);
  return { contract: factory.attach(address), deployment, address };
}

function getTokenId(fallback) {
  const raw = process.env.TOKEN_ID;
  if (raw !== undefined && raw !== "") return BigInt(raw);
  if (fallback === undefined || fallback === 0n) throw new Error("No token minted yet. Mint one first or pass TOKEN_ID=...");
  return BigInt(fallback);
}

// Pending nonce avoids "nonce too low" errors when sending several transactions in a row
async function nextNonce(wallet) {
  return hre.ethers.provider.getTransactionCount(wallet.address, "pending");
}

function explorerLinks(address, tokenId) {
  if (hre.network.name !== "sepolia") return [];
  const links = [`Etherscan contract: https://sepolia.etherscan.io/address/${address}`];
  if (tokenId !== undefined) {
    links.push(`Etherscan NFT:      https://sepolia.etherscan.io/nft/${address}/${tokenId}`);
    links.push(`OpenSea testnet:    https://testnets.opensea.io/assets/sepolia/${address}/${tokenId}`);
  }
  return links;
}

// Prints the revert reason of a refused call in a readable way. OpenZeppelin reverts with
// custom errors (e.g. OwnableUnauthorizedAccount(address)): ethers sometimes decodes them in
// error.revert, otherwise only the raw error.data is there and `contract` is used to decode it.
function revertReason(error, contract) {
  let decoded = error.revert;
  if (!decoded && contract && typeof error.data === "string") {
    try { decoded = contract.interface.parseError(error.data); } catch { /* not one of this contract's errors */ }
  }
  if (decoded) return `${decoded.name}(${decoded.args.join(", ")})`;
  return error.reason || error.shortMessage || error.message;
}

module.exports = {
  REPO_ROOT,
  getCollection,
  loadDeployment,
  saveDeployment,
  getWallet,
  getDeployedContract,
  getTokenId,
  nextNonce,
  explorerLinks,
  revertReason,
};

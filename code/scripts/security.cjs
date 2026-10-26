// Demonstrates ownership and privileges without spending gas.
// Every forbidden action is simulated with `staticCall`: the node executes it and
// returns the revert reason, but nothing is sent to the blockchain.
const hre = require("hardhat");
const { getWallet, getDeployedContract, loadDeployment, revertReason } = require("./common.cjs");

const NFT = { contractName: "Mokko42NFT", key: "nft" };
const INSCRIPTIONS = { contractName: "Mokko42Inscriptions", key: "inscriptions" };

// Runs a simulated call on `contract` that MUST be refused
async function expectRefused(contract, label, call) {
  try {
    await call();
    console.log(`  ❌ ${label}: ACCEPTED (this should never happen)`);
    process.exitCode = 1;
  } catch (e) {
    console.log(`  ✅ ${label}: refused -> "${revertReason(e, contract)}"`);
  }
}

// Picks an existing token that `wallet` does NOT own, to try to steal it
async function findTokenNotOwnedBy(contract, wallet) {
  const supply = await contract.totalSupply();
  for (let id = 1n; id <= supply; id++) {
    const tokenOwner = await contract.ownerOf(id);
    if (tokenOwner.toLowerCase() !== wallet.address.toLowerCase()) return { id, tokenOwner };
  }
  return null;
}

async function checkCollection(collection, attacker) {
  const { contract, address } = await getDeployedContract(collection, attacker);
  console.log(`${collection.contractName} (${address})`);
  console.log("  Contract owner:", await contract.owner());
  console.log("  Attacker:      ", attacker.address, "(PRIVATE_KEY2)");

  if (collection.key === "nft") {
    await expectRefused(contract, "Non-owner mint", () =>
      contract.mint.staticCall(attacker.address, "ipfs://stolen"));
  } else {
    await expectRefused(contract, "Non-owner mint", () =>
      contract.mint.staticCall(attacker.address, "42 - Fake", "", "image/svg+xml", "0x42"));
  }

  await expectRefused(contract, "Non-owner transferOwnership", () =>
    contract.transferOwnership.staticCall(attacker.address));

  const target = await findTokenNotOwnedBy(contract, attacker);
  if (target) {
    await expectRefused(contract, `Steal token ${target.id} from ${target.tokenOwner}`, () =>
      contract.transferFrom.staticCall(target.tokenOwner, attacker.address, target.id));
    await expectRefused(contract, `Approve self on token ${target.id}`, () =>
      contract.approve.staticCall(attacker.address, target.id));
    if (collection.key === "inscriptions") {
      await expectRefused(contract, `Modify artwork of token ${target.id}`, () =>
        contract.appendImage.staticCall(target.id, "0x42"));
    }
  } else {
    console.log("  (no token owned by someone else: mint one to test theft protection)");
  }

  await expectRefused(contract, "Read a nonexistent token", () => contract.ownerOf(999999));
  console.log("");
}

async function main() {
  const attacker = await getWallet(2);
  const deployment = loadDeployment();

  console.log("Network:", hre.network.name);
  console.log("");

  if (deployment.nft) await checkCollection(NFT, attacker);
  if (deployment.inscriptions) await checkCollection(INSCRIPTIONS, attacker);
  if (!deployment.nft && !deployment.inscriptions) throw new Error("Nothing deployed yet.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

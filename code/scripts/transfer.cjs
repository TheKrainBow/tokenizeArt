// Transfers a token with safeTransferFrom, then shows the new owner.
//   COLLECTION=nft | inscriptions
//   TOKEN_ID=<id>   defaults to the last minted token
//   FROM=1 | 2      wallet that signs: PRIVATE_KEY (default) or PRIVATE_KEY2
//   TO=0x...        defaults to the other wallet
const hre = require("hardhat");
const { getCollection, getWallet, getDeployedContract, getTokenId, nextNonce, explorerLinks } = require("./common.cjs");

async function main() {
  const fromIndex = Number(process.env.FROM || "1");
  if (fromIndex !== 1 && fromIndex !== 2) throw new Error("FROM must be 1 or 2");

  const sender = await getWallet(fromIndex);
  const other = await getWallet(fromIndex === 1 ? 2 : 1);
  const receiver = process.env.TO || other.address;

  const { contract, address } = await getDeployedContract(getCollection(), sender);
  const tokenId = getTokenId(await contract.totalSupply());

  const ownerBefore = await contract.ownerOf(tokenId);
  console.log("Contract:      ", address);
  console.log("Token id:      ", tokenId.toString());
  console.log("Owner before:  ", ownerBefore);
  console.log("Signer:        ", sender.address);
  console.log("Receiver:      ", receiver);

  if (ownerBefore.toLowerCase() !== sender.address.toLowerCase()) {
    console.log("");
    console.log(`The signer does not own token ${tokenId}. Try FROM=${fromIndex === 1 ? 2 : 1}.`);
    process.exitCode = 1;
    return;
  }

  const tx = await contract["safeTransferFrom(address,address,uint256)"](sender.address, receiver, tokenId, {
    nonce: await nextNonce(sender),
  });
  console.log("Tx hash:       ", tx.hash);
  await tx.wait();

  console.log("Owner after:   ", await contract.ownerOf(tokenId));
  for (const link of explorerLinks(address, tokenId)) console.log(link);
  if (hre.network.name === "sepolia") console.log(`Transaction:    https://sepolia.etherscan.io/tx/${tx.hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

// Mints a Mokko42NFT token pointing to IPFS metadata. Only the contract owner (PRIVATE_KEY) can.
//   METADATA_URI=ipfs://...  defaults to the last upload in mint/ipfs.json
//   MINT_TO=0x...            defaults to the PRIVATE_KEY wallet
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const {
  REPO_ROOT, getCollection, saveDeployment, getWallet, getDeployedContract, nextNonce, explorerLinks,
} = require("./common.cjs");

function lastUploadedMetadataURI() {
  const uploadsFile = path.join(REPO_ROOT, "mint", "ipfs.json");
  if (!fs.existsSync(uploadsFile)) return null;
  const uploads = JSON.parse(fs.readFileSync(uploadsFile, "utf8"));
  return uploads.length ? uploads[uploads.length - 1].metadataURI : null;
}

async function main() {
  const owner = await getWallet(1);
  const { contract, deployment, address } = await getDeployedContract(getCollection(), owner);

  const metadataURI = process.env.METADATA_URI || lastUploadedMetadataURI();
  if (!metadataURI) throw new Error("No metadata to mint. Run make ipfs-upload first or pass METADATA_URI=ipfs://...");
  const receiver = process.env.MINT_TO || owner.address;

  console.log("Contract:    ", address);
  console.log("Owner:       ", await contract.owner());
  console.log("Mint signer: ", owner.address);
  console.log("Receiver:    ", receiver);
  console.log("Metadata URI:", metadataURI);

  const tx = await contract.mint(receiver, metadataURI, { nonce: await nextNonce(owner) });
  console.log("Tx hash:     ", tx.hash);
  const receipt = await tx.wait();

  // Read the new token id from the Minted event
  const minted = receipt.logs
    .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
    .find((event) => event && event.name === "Minted");
  const tokenId = minted.args.tokenId;

  console.log("");
  console.log("Token id:    ", tokenId.toString());
  console.log("ownerOf:     ", await contract.ownerOf(tokenId));
  console.log("tokenURI:    ", await contract.tokenURI(tokenId));

  deployment.nft.tokens.push({
    tokenId: tokenId.toString(),
    mintedTo: receiver,
    tokenURI: metadataURI,
    mintTx: tx.hash,
    mintedAt: new Date().toISOString(),
  });
  saveDeployment(deployment);

  for (const link of explorerLinks(address, tokenId)) console.log(link);
  if (hre.network.name === "sepolia") console.log("(OpenSea may take a few minutes to index a new token)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

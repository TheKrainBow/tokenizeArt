// Displays a token: owner (ownerOf), tokenURI, metadata and image link.
//   COLLECTION=nft | inscriptions, TOKEN_ID=<id> (defaults to the last minted token)
// For on-chain tokens, the decoded image is also written to mint/onchain/.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { REPO_ROOT, getCollection, getDeployedContract, getTokenId, explorerLinks } = require("./common.cjs");

// Public gateways rate-limit (HTTP 429), so several are tried in order. IPFS_GATEWAY goes first.
const IPFS_GATEWAYS = [
  process.env.IPFS_GATEWAY,
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.filebase.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://ipfs.io/ipfs/",
].filter(Boolean);
const EXTENSIONS = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

function ipfsToHttp(uri, gateway = IPFS_GATEWAYS[0]) {
  return uri.startsWith("ipfs://") ? gateway + uri.slice("ipfs://".length) : uri;
}

function decodeDataURI(uri) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
  if (!match) throw new Error("Unsupported data URI");
  return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
}

async function readMetadata(tokenURI) {
  if (tokenURI.startsWith("data:")) {
    return JSON.parse(decodeDataURI(tokenURI).bytes.toString("utf8"));
  }
  const errors = [];
  for (const gateway of IPFS_GATEWAYS) {
    const url = ipfsToHttp(tokenURI, gateway);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (response.ok) return response.json();
      errors.push(`${response.status} from ${url}`);
    } catch (e) {
      errors.push(`${e.message} for ${url}`);
    }
  }
  throw new Error(`No gateway answered:\n  ${errors.join("\n  ")}`);
}

async function main() {
  const collection = getCollection();
  const provider = hre.ethers.provider;
  const { contract, address } = await getDeployedContract(collection, provider);
  const tokenId = getTokenId(await contract.totalSupply());

  console.log("Collection: ", await contract.name(), `(${await contract.symbol()})`);
  console.log("Contract:   ", address);
  console.log("Artist:     ", await contract.artist());
  console.log("Total supply:", (await contract.totalSupply()).toString());
  console.log("");
  console.log("Token id:   ", tokenId.toString());
  console.log("ownerOf:    ", await contract.ownerOf(tokenId));

  const tokenURI = await contract.tokenURI(tokenId);
  console.log("tokenURI:   ", tokenURI.length > 120 ? `${tokenURI.slice(0, 120)}... (${tokenURI.length} chars)` : tokenURI);

  let metadata;
  try {
    metadata = await readMetadata(tokenURI);
  } catch (e) {
    console.log("Could not read metadata:", e.message);
    return;
  }

  console.log("");
  console.log("Metadata name:  ", metadata.name);
  console.log("Metadata artist:", metadata.artist);
  console.log("Description:    ", metadata.description);
  console.log("Attributes:     ", (metadata.attributes || []).map((a) => `${a.trait_type}=${a.value}`).join(", "));

  if (metadata.image.startsWith("data:")) {
    const { mimeType, bytes } = decodeDataURI(metadata.image);
    const outFile = path.join(REPO_ROOT, "mint", "onchain", `${hre.network.name}-token-${tokenId}.${EXTENSIONS[mimeType] || "bin"}`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, bytes);
    console.log("Image:           on-chain", mimeType, `${bytes.length} bytes -> ${path.relative(REPO_ROOT, outFile)}`);
    if (collection.key === "inscriptions") console.log("Finalized:      ", await contract.isFinalized(tokenId));
  } else {
    console.log("Image:          ", metadata.image);
    console.log("Image (HTTP):   ", ipfsToHttp(metadata.image));
  }

  console.log("");
  for (const link of explorerLinks(address, tokenId)) console.log(link);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

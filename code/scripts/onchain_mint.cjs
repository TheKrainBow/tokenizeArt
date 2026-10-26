// Bonus: inscribes an artwork fully on-chain in Mokko42Inscriptions. Owner (PRIVATE_KEY) only.
//   ARTWORK=path/to/image   SVG strongly recommended (small = cheap). PNG/JPEG/GIF/WEBP accepted.
//   TITLE="My title"        the NFT name becomes "42 - My title"
//   DESCRIPTION="..."       optional
//   MINT_TO=0x...           defaults to the PRIVATE_KEY wallet
//   CHUNK_SIZE=12000        bytes stored per transaction
//
// Steps: mint (first chunk) -> appendImage (other chunks) -> finalize (frozen forever).
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const {
  REPO_ROOT, saveDeployment, getWallet, getDeployedContract, nextNonce, explorerLinks,
} = require("./common.cjs");
const { buildNftName, mimeTypeOf } = require("./metadata.cjs");

const INSCRIPTIONS = { contractName: "Mokko42Inscriptions", key: "inscriptions" };

// The contract inserts text in JSON without escaping, so it refuses these characters
function assertJsonSafe(label, text) {
  if (/["\\\u0000-\u001f]/.test(text)) throw new Error(`${label} cannot contain quotes, backslashes or line breaks`);
}

async function main() {
  const owner = await getWallet(1);
  const { contract, deployment, address } = await getDeployedContract(INSCRIPTIONS, owner);

  if (!process.env.ARTWORK) throw new Error("Missing ARTWORK=path/to/image (SVG recommended)");
  const artworkPath = path.resolve(process.env.ARTWORK);
  if (!fs.existsSync(artworkPath)) throw new Error(`Artwork not found: ${artworkPath}`);

  const image = fs.readFileSync(artworkPath);
  const mimeType = mimeTypeOf(artworkPath);
  const name = buildNftName(process.env.TITLE);
  const artist = await contract.artist();
  const description = process.env.DESCRIPTION || `${name}, an on-chain artwork by ${artist} for TokenizeArt.`;
  const receiver = process.env.MINT_TO || owner.address;
  const chunkSize = Number(process.env.CHUNK_SIZE || "12000");

  assertJsonSafe("TITLE", name);
  assertJsonSafe("DESCRIPTION", description);

  const chunks = [];
  for (let offset = 0; offset < image.length; offset += chunkSize) {
    chunks.push(image.subarray(offset, offset + chunkSize));
  }

  console.log("Contract:  ", address);
  console.log("Name:      ", name);
  console.log("Artist:    ", artist);
  console.log("Artwork:   ", path.relative(REPO_ROOT, artworkPath), `(${mimeType}, ${image.length} bytes)`);
  console.log("Receiver:  ", receiver);
  console.log("Chunks:    ", chunks.length, `x ${chunkSize} bytes max`);
  console.log("");

  // tokenURI costs ~240 gas per image byte (storage read + base64 twice). RPC nodes cap read-only
  // calls (16.7M gas on publicnode), and a finalized token cannot be fixed, so refuse big images.
  const maxBytes = Number(process.env.MAX_IMAGE_BYTES || 32000);
  if (image.length > maxBytes) {
    throw new Error(`Image is ${image.length} bytes, max ${maxBytes}: tokenURI would exceed the RPC gas cap. ` +
      "Use a smaller SVG/WebP (or MAX_IMAGE_BYTES=... at your own risk).");
  }

  // 1. Mint with the first chunk
  const mintTx = await contract.mint(receiver, name, description, mimeType, chunks[0], { nonce: await nextNonce(owner) });
  console.log(`[1/${chunks.length}] mint        ${mintTx.hash}`);
  const receipt = await mintTx.wait();
  const inscribed = receipt.logs
    .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
    .find((event) => event && event.name === "Inscribed");
  const tokenId = inscribed.args.tokenId;

  // 2. Append the remaining chunks
  for (let i = 1; i < chunks.length; i++) {
    const tx = await contract.appendImage(tokenId, chunks[i], { nonce: await nextNonce(owner) });
    console.log(`[${i + 1}/${chunks.length}] appendImage ${tx.hash}`);
    await tx.wait();
  }

  // 3. Freeze the artwork
  const finalizeTx = await contract.finalize(tokenId, { nonce: await nextNonce(owner) });
  console.log("finalize          ", finalizeTx.hash);
  await finalizeTx.wait();

  // Check that what the blockchain returns is exactly the original file
  const stored = Buffer.from(hre.ethers.getBytes(await contract.imageData(tokenId)));
  console.log("");
  console.log("Token id:  ", tokenId.toString());
  console.log("ownerOf:   ", await contract.ownerOf(tokenId));
  console.log("Image check:", stored.equals(image) ? "on-chain bytes match the file ✅" : "MISMATCH ❌");

  deployment.inscriptions.tokens.push({
    tokenId: tokenId.toString(),
    name,
    mintedTo: receiver,
    artwork: path.relative(REPO_ROOT, artworkPath),
    imageBytes: image.length,
    chunks: chunks.length,
    mintTx: mintTx.hash,
    finalizeTx: finalizeTx.hash,
    mintedAt: new Date().toISOString(),
  });
  saveDeployment(deployment);

  for (const link of explorerLinks(address, tokenId)) console.log(link);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

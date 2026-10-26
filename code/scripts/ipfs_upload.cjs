// Uploads an artwork and its ERC-721 metadata JSON to IPFS through Pinata.
//
// Usage (from code/):
//   make ipfs-upload ARTWORK=../mint/artworks/my-art.png TITLE="My title" DESCRIPTION="..."
//
// Result:
//   - mint/metadata/<slug>.json : the metadata file (image = ipfs://<image CID>)
//   - mint/ipfs.json            : history of uploads, the last one is used by `make mint`
//
// Without PINATA_JWT, upload the image yourself (Pinata web UI, `ipfs add`...) and pass
// IMAGE_CID=...; the script then only writes the metadata file for you to upload.
const fs = require("fs");
const path = require("path");
require("dotenv").config({ quiet: true });
const { buildNftName, mimeTypeOf, buildMetadata, slugify } = require("./metadata.cjs");

const REPO_ROOT = path.join(__dirname, "..", "..");
const METADATA_DIR = path.join(REPO_ROOT, "mint", "metadata");
const UPLOADS_FILE = path.join(REPO_ROOT, "mint", "ipfs.json");

const PINATA_V3_URL = "https://uploads.pinata.cloud/v3/files";
const PINATA_LEGACY_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

// Uploads one file and returns its CID. Tries the current Pinata API, then the legacy one.
async function pinataUpload(jwt, fileName, content, mimeType) {
  const headers = { Authorization: `Bearer ${jwt}` };

  const v3Form = new FormData();
  v3Form.append("file", new Blob([content], { type: mimeType }), fileName);
  v3Form.append("network", "public");
  v3Form.append("name", fileName);
  const v3Response = await fetch(PINATA_V3_URL, { method: "POST", headers, body: v3Form });
  if (v3Response.ok) {
    return (await v3Response.json()).data.cid;
  }
  const v3Error = await v3Response.text();

  const legacyForm = new FormData();
  legacyForm.append("file", new Blob([content], { type: mimeType }), fileName);
  legacyForm.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  const legacyResponse = await fetch(PINATA_LEGACY_URL, { method: "POST", headers, body: legacyForm });
  if (legacyResponse.ok) {
    return (await legacyResponse.json()).IpfsHash;
  }

  throw new Error(`Pinata upload failed.\nv3: ${v3Error}\nlegacy: ${await legacyResponse.text()}`);
}

function loadUploads() {
  return fs.existsSync(UPLOADS_FILE) ? JSON.parse(fs.readFileSync(UPLOADS_FILE, "utf8")) : [];
}

async function main() {
  const artist = process.env.ARTIST_LOGIN;
  const artworkArg = process.env.ARTWORK;
  const jwt = process.env.PINATA_JWT;
  if (!artist) throw new Error("Missing ARTIST_LOGIN in .env (your 42 login)");
  if (!artworkArg) throw new Error("Missing ARTWORK=path/to/image");

  const artworkPath = path.resolve(artworkArg);
  if (!fs.existsSync(artworkPath)) throw new Error(`Artwork not found: ${artworkPath}`);

  const name = buildNftName(process.env.TITLE);
  const description = process.env.DESCRIPTION || `${name}, an artwork by ${artist} for TokenizeArt.`;
  const mimeType = mimeTypeOf(artworkPath);
  const slug = slugify(name);

  console.log("Artist:  ", artist);
  console.log("Name:    ", name);
  console.log("Artwork: ", path.relative(REPO_ROOT, artworkPath), `(${mimeType})`);
  console.log("");

  // 1. Image -> IPFS
  let imageCID = process.env.IMAGE_CID;
  if (!imageCID) {
    if (!jwt) throw new Error("Missing PINATA_JWT in .env (or upload the image manually and pass IMAGE_CID=...)");
    console.log("Uploading image to IPFS...");
    imageCID = await pinataUpload(jwt, path.basename(artworkPath), fs.readFileSync(artworkPath), mimeType);
  }
  console.log("Image CID:", imageCID);

  // 2. Metadata JSON -> mint/metadata/<slug>.json
  const metadata = buildMetadata({ name, description, artist, image: `ipfs://${imageCID}`, storage: "IPFS" });
  const metadataJson = JSON.stringify(metadata, null, 2) + "\n";
  const metadataFile = path.join(METADATA_DIR, `${slug}.json`);
  fs.mkdirSync(METADATA_DIR, { recursive: true });
  fs.writeFileSync(metadataFile, metadataJson);
  console.log("Metadata file:", path.relative(REPO_ROOT, metadataFile));

  // 3. Metadata JSON -> IPFS
  let metadataCID = process.env.METADATA_CID;
  if (!metadataCID && jwt) {
    console.log("Uploading metadata to IPFS...");
    metadataCID = await pinataUpload(jwt, `${slug}.json`, metadataJson, "application/json");
  }
  if (!metadataCID) {
    console.log("");
    console.log(`Upload ${path.relative(REPO_ROOT, metadataFile)} to IPFS, then run:`);
    console.log("  make mint METADATA_URI=ipfs://<metadata CID>");
    return;
  }
  console.log("Metadata CID:", metadataCID);

  const uploads = loadUploads();
  uploads.push({
    name,
    artwork: path.relative(REPO_ROOT, artworkPath),
    imageURI: `ipfs://${imageCID}`,
    metadataFile: path.relative(REPO_ROOT, metadataFile),
    metadataURI: `ipfs://${metadataCID}`,
    uploadedAt: new Date().toISOString(),
  });
  fs.writeFileSync(UPLOADS_FILE, JSON.stringify(uploads, null, 2) + "\n");

  console.log("");
  console.log("Image:    https://gateway.pinata.cloud/ipfs/" + imageCID);
  console.log("Metadata: https://gateway.pinata.cloud/ipfs/" + metadataCID);
  console.log("Saved:", path.relative(REPO_ROOT, UPLOADS_FILE), "- next step: make mint");
}

// Run as a script (make ipfs-upload); the website server only imports pinataUpload
if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  });
}

module.exports = { pinataUpload };

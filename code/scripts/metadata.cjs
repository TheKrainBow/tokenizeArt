// Metadata helpers shared by the IPFS upload script and the on-chain mint script.
const path = require("path");

const MIME_TYPES = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// The subject requires the NFT name to contain 42 and a title: "42 - <title>"
function buildNftName(title) {
  if (!title || !title.trim()) throw new Error("Missing TITLE (example: TITLE=\"Blue Whale\")");
  const cleanTitle = title.trim();
  return cleanTitle.includes("42") ? cleanTitle : `42 - ${cleanTitle}`;
}

function mimeTypeOf(file) {
  const mime = MIME_TYPES[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unsupported image type: ${file} (use ${Object.keys(MIME_TYPES).join(", ")})`);
  return mime;
}

// ERC-721 metadata JSON (the format read by wallets, Etherscan and OpenSea)
function buildMetadata({ name, description, artist, image, storage }) {
  return {
    name,
    description,
    artist,
    created_by: artist,
    image,
    attributes: [
      { trait_type: "Artist", value: artist },
      { trait_type: "Storage", value: storage },
    ],
  };
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

module.exports = { buildNftName, mimeTypeOf, buildMetadata, slugify };

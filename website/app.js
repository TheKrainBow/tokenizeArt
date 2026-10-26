// TokenizeArt website (bonus): browse, mint and transfer the two collections.
// Reads go through a public RPC (works without a wallet). Writes are signed by
// the user's wallet (MetaMask). Every permission is enforced by the contracts:
// the website only hides buttons, it cannot grant any privilege.
"use strict";

const CONFIG = window.TOKENIZEART_CONFIG;
const { ethers } = window;
const CHUNK_SIZE = 12000; // bytes of image stored per on-chain transaction
// tokenURI costs ~240 gas per image byte and RPC nodes cap read-only calls (16.7M gas),
// so a bigger image would give a finalized token that nobody can read (same limit as the CLI)
const MAX_ONCHAIN_IMAGE_BYTES = 32000;

const state = {
  readProvider: null,
  signer: null,
  account: null,
  ipfsEnabled: false,
  currentTab: "gallery", // tab shown when leaving a token page
};

// ---------- Small DOM helpers (textContent only: metadata is untrusted) ----------

const $ = (selector) => document.querySelector(selector);

function element(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function log(target, message) {
  const box = $(target);
  box.hidden = false;
  box.textContent += `${message}\n`;
  box.scrollTop = box.scrollHeight;
}

function clearLog(target) {
  $(target).textContent = "";
  $(target).hidden = true;
}

// OpenZeppelin custom errors (e.g. OwnableUnauthorizedAccount(address)) are decoded by ethers in error.revert
function errorMessage(error) {
  if (error?.revert) return `${error.revert.name}(${error.revert.args.join(", ")})`;
  return error?.reason || error?.info?.error?.message || error?.shortMessage || error?.message || String(error);
}

function explorerLink(path, label) {
  if (!CONFIG.explorer) return document.createTextNode(label);
  return element("a", { href: `${CONFIG.explorer}/${path}`, target: "_blank", rel: "noopener", textContent: label });
}

// ---------- Contracts and metadata ----------

function isDeployed(key) {
  return Boolean(CONFIG.contracts[key]?.address);
}

function contractFor(key, runner) {
  const { address, abi } = CONFIG.contracts[key];
  return new ethers.Contract(address, abi, runner);
}

// Public gateways rate-limit (HTTP 429), so several are tried in order, the configured one first
const IPFS_GATEWAYS = [...new Set([
  CONFIG?.ipfsGateway,
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.filebase.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://ipfs.io/ipfs/",
].filter(Boolean))];

function ipfsToHttp(uri, gateway = IPFS_GATEWAYS[0]) {
  return uri.startsWith("ipfs://") ? gateway + uri.slice("ipfs://".length) : uri;
}

// tokenURI -> metadata object (data: URI decoded locally, ipfs:// fetched via the first gateway that answers)
async function fetchMetadata(tokenURI) {
  if (tokenURI.startsWith("data:application/json;base64,")) {
    const bytes = ethers.decodeBase64(tokenURI.slice("data:application/json;base64,".length));
    return JSON.parse(ethers.toUtf8String(bytes));
  }
  if (!tokenURI.startsWith("ipfs://")) throw new Error(`Unsupported tokenURI: ${tokenURI}`);

  const errors = [];
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const response = await fetch(ipfsToHttp(tokenURI, gateway));
      if (response.ok) return await response.json();
      errors.push(`${new URL(gateway).host} ${response.status}`);
    } catch (error) {
      errors.push(`${new URL(gateway).host} ${error.message}`);
    }
  }
  throw new Error(`No IPFS gateway answered (${errors.join(", ")})`);
}

// <img> for an image URI; an ipfs:// image moves on to the next gateway if one fails
function imageElement(uri, alt) {
  const image = element("img", { alt, loading: "lazy" });
  const source = uri ? safeImageSource(uri) : "";
  if (!source) return image;

  let gatewayIndex = 0;
  image.src = source;
  if (uri.startsWith("ipfs://")) {
    image.addEventListener("error", () => {
      gatewayIndex += 1;
      if (gatewayIndex < IPFS_GATEWAYS.length) image.src = ipfsToHttp(uri, IPFS_GATEWAYS[gatewayIndex]);
    });
  }
  return image;
}

// Only allow image sources that cannot run code in the page
function safeImageSource(uri) {
  if (uri.startsWith("data:image/") || uri.startsWith("ipfs://") || uri.startsWith("https://")) return ipfsToHttp(uri);
  return "";
}

async function readToken(key, tokenId) {
  const contract = contractFor(key, state.readProvider);
  const [owner, tokenURI] = await Promise.all([contract.ownerOf(tokenId), contract.tokenURI(tokenId)]);
  let metadata = null;
  try {
    metadata = await fetchMetadata(tokenURI);
  } catch (error) {
    console.warn(`Metadata of ${key} #${tokenId}:`, error);
  }
  return { key, tokenId, owner, tokenURI, metadata };
}

function tokenCard(token) {
  const { key, tokenId, owner, metadata } = token;
  const address = CONFIG.contracts[key].address;
  const storage = key === "nft" ? "IPFS" : "On-chain";

  const image = imageElement(metadata?.image, metadata?.name || `Token ${tokenId}`);

  const ownerLine = element("div", { className: "nft-meta" }, [
    "Owner: ", explorerLink(`address/${owner}`, shortAddress(owner)),
    state.account && owner.toLowerCase() === state.account.toLowerCase() ? " (you)" : "",
  ]);

  // Click anywhere on the card (except a link) to see the contract and token details
  const card = element("article", { className: "card nft clickable", tabIndex: 0, title: "Show contract and metadata" }, [
    image,
    element("div", { className: "nft-body" }, [
      element("div", { className: "nft-title", textContent: metadata?.name || "(metadata unavailable)" }),
      element("div", { className: "nft-meta", textContent: `Artist: ${metadata?.artist || "?"}` }),
      ownerLine,
      element("div", { className: "nft-meta" }, [
        element("span", { className: "badge", textContent: storage }), " ",
        explorerLink(`nft/${address}/${tokenId}`, `#${tokenId}`),
      ]),
    ]),
  ]);
  card.addEventListener("click", (event) => {
    if (!event.target.closest("a")) openToken(key, tokenId);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter") openToken(key, tokenId);
  });
  return card;
}

// ---------- Gallery ----------

// One section per collection: they are two contracts, so the same artwork minted in both is two NFTs
async function loadCollection(key) {
  const gallery = $(`#gallery-${key}`);
  const empty = (text) => gallery.replaceChildren(element("p", { className: "empty", textContent: text }));
  if (!isDeployed(key)) return empty("Not deployed on this network.");
  empty("Loading tokens…");

  let supply;
  try {
    supply = await contractFor(key, state.readProvider).totalSupply();
  } catch (error) {
    return empty(`❌ ${errorMessage(error)}`);
  }

  const jobs = [];
  for (let id = 1n; id <= supply; id++) jobs.push(readToken(key, id));
  const results = await Promise.allSettled(jobs);
  const cards = results.filter((r) => r.status === "fulfilled").map((r) => tokenCard(r.value));
  if (!cards.length) return empty("No token minted yet.");
  gallery.replaceChildren(...cards);
}

async function loadGallery() {
  await Promise.all(["nft", "inscriptions"].map(loadCollection));
}

// ---------- Wallet ----------

async function ensureNetwork() {
  const chainIdHex = ethers.toQuantity(CONFIG.chainId);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    // Unknown network in the wallet: add it
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainIdHex,
        chainName: CONFIG.chainName,
        rpcUrls: [CONFIG.rpcUrl],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        blockExplorerUrls: CONFIG.explorer ? [CONFIG.explorer] : [],
      }],
    });
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    alert("No wallet found. Install MetaMask (or another EIP-1193 wallet) to sign transactions.");
    return;
  }
  await ensureNetwork();
  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  state.signer = await browserProvider.getSigner();
  state.account = await state.signer.getAddress();
  $("#connect-button").textContent = shortAddress(state.account);
  await updateRole();
  await loadGallery();
}

// Shows whether the connected wallet owns the contracts (= can mint)
async function updateRole() {
  const badge = $("#role-badge");
  if (!state.account) return;

  const owners = [];
  for (const key of ["nft", "inscriptions"]) {
    if (!isDeployed(key)) continue;
    const owner = await contractFor(key, state.readProvider).owner();
    if (owner.toLowerCase() === state.account.toLowerCase()) owners.push(key === "nft" ? "IPFS" : "on-chain");
  }

  badge.hidden = false;
  if (owners.length) {
    badge.textContent = `Contract owner (${owners.join(" + ")})`;
    badge.className = "badge ok";
    $("#mint-notice").textContent = "You own the contracts: you can mint in the collections listed in the badge above.";
  } else {
    badge.textContent = "Collector";
    badge.className = "badge";
    $("#mint-notice").textContent = "This wallet is not the contract owner: the contract will refuse to mint (you can try, the revert reason will be shown).";
  }
}

function requireSigner() {
  if (!state.signer) throw new Error("Connect your wallet first.");
  return state.signer;
}

function receiverOrSelf(value) {
  const receiver = value.trim() || state.account;
  if (!ethers.isAddress(receiver)) throw new Error(`Invalid address: ${receiver}`);
  return receiver;
}

function mintedTokenId(contract, receipt, eventName) {
  for (const entry of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(entry);
      if (parsed?.name === eventName) return parsed.args.tokenId;
    } catch { /* log from another contract */ }
  }
  return null;
}

// ---------- Mint helpers ----------

// The subject requires the NFT name to contain 42 and a title: "42 - <title>"
function buildNftName(title) {
  const clean = title.trim();
  return clean.includes("42") ? clean : `42 - ${clean}`;
}

// The on-chain contract inserts text in JSON without escaping, so it refuses these characters
function assertJsonSafe(label, text) {
  if (/["\\\u0000-\u001f]/.test(text)) throw new Error(`${label} cannot contain quotes, backslashes or line breaks`);
}

// Uploads one file to IPFS and returns its CID. The website server (make website) pins it
// on Pinata with PINATA_JWT from code/.env, so the JWT never reaches the browser.
async function ipfsUpload(file) {
  const response = await fetch("/api/ipfs", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
    body: file,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `IPFS upload failed (${response.status})`);
  return result.cid;
}

// Tells the Mint form whether the server can upload to IPFS (PINATA_JWT set in code/.env)
async function checkIpfsUploads() {
  try {
    const response = await fetch("/api/ipfs");
    state.ipfsEnabled = response.ok && (await response.json()).enabled;
  } catch {
    state.ipfsEnabled = false;
  }
  if (!state.ipfsEnabled) {
    $("#ipfs-hint").textContent = "Mandatory part. Unavailable: add PINATA_JWT to code/.env, then restart make website.";
  }
}

// Same metadata format as code/scripts/metadata.cjs
function buildMetadata({ name, description, artist, image }) {
  return {
    name,
    description,
    artist,
    created_by: artist,
    image,
    attributes: [
      { trait_type: "Artist", value: artist },
      { trait_type: "Storage", value: "IPFS" },
    ],
  };
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------- Mint form ----------

// Keeps the form in sync with the chosen file and storage: preview, name, size limit
function updateMintForm() {
  const form = $("#mint-form");
  const file = form.file.files[0];
  const onchainRadio = form.querySelector('input[value="inscriptions"]');

  const preview = $("#mint-preview");
  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    $("#dropzone-text").textContent = `${file.name} — ${Math.ceil(file.size / 1000)} KB (click to change)`;
  }

  const title = form.title.value.trim();
  $("#name-hint").textContent = `NFT name: “${title ? buildNftName(title) : "42 - …"}”`;

  // Too big for on-chain storage: tokenURI would exceed the RPC gas cap
  const tooBig = Boolean(file) && file.size > MAX_ONCHAIN_IMAGE_BYTES;
  onchainRadio.disabled = tooBig;
  if (tooBig && onchainRadio.checked) form.querySelector('input[value="nft"]').checked = true;
  $("#onchain-hint").textContent = tooBig
    ? `Not available: this image is ${Math.ceil(file.size / 1000)} KB, the limit is 32 KB.`
    : "Bonus. Image stored inside the contract, 32 KB max.";
}

// IPFS: image -> Pinata, metadata JSON -> Pinata, then mint(receiver, ipfs://<metadata CID>)
async function mintWithIpfs(signer, { file, name, description, receiver }) {
  if (!state.ipfsEnabled) throw new Error("IPFS uploads are off: add PINATA_JWT to code/.env, then restart make website.");
  const contract = contractFor("nft", signer);
  const artist = await contract.artist(); // always the login set at deployment

  // Simulate first: a non-owner is refused before anything is uploaded
  await contract.mint.staticCall(receiver, "ipfs://check");

  log("#mint-log", `Uploading ${file.name} to IPFS…`);
  const imageCID = await ipfsUpload(file);
  log("#mint-log", `Image:    ipfs://${imageCID}`);

  const metadata = buildMetadata({
    name,
    description: description || `${name}, an artwork by ${artist} for TokenizeArt.`,
    artist,
    image: `ipfs://${imageCID}`,
  });
  const metadataFile = new File([JSON.stringify(metadata, null, 2)], `${slugify(name)}.json`, { type: "application/json" });
  const metadataCID = await ipfsUpload(metadataFile);
  log("#mint-log", `Metadata: ipfs://${metadataCID}`);

  const tx = await contract.mint(receiver, `ipfs://${metadataCID}`);
  log("#mint-log", `mint ${tx.hash}`);
  return mintedTokenId(contract, await tx.wait(), "Minted");
}

// On-chain: mint (first chunk) -> appendImage (other chunks) -> finalize (frozen forever)
async function mintOnchain(signer, { file, name, description, receiver }) {
  if (file.size > MAX_ONCHAIN_IMAGE_BYTES) {
    throw new Error(`Image is ${file.size} bytes, max ${MAX_ONCHAIN_IMAGE_BYTES}: tokenURI would exceed the RPC gas cap.`);
  }
  assertJsonSafe("Title", name);
  assertJsonSafe("Description", description);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) chunks.push(bytes.slice(offset, offset + CHUNK_SIZE));

  const contract = contractFor("inscriptions", signer);
  log("#mint-log", `Inscribing ${file.name} (${bytes.length} bytes): ${chunks.length + 1} transaction(s) to sign`);

  await contract.mint.staticCall(receiver, name, description, file.type, chunks[0]);
  const mintTx = await contract.mint(receiver, name, description, file.type, chunks[0]);
  log("#mint-log", `[1/${chunks.length}] mint ${mintTx.hash}`);
  const tokenId = mintedTokenId(contract, await mintTx.wait(), "Inscribed");

  for (let i = 1; i < chunks.length; i++) {
    const tx = await contract.appendImage(tokenId, chunks[i]);
    log("#mint-log", `[${i + 1}/${chunks.length}] appendImage ${tx.hash}`);
    await tx.wait();
  }

  const finalizeTx = await contract.finalize(tokenId);
  log("#mint-log", `finalize ${finalizeTx.hash}`);
  await finalizeTx.wait();
  return tokenId;
}

async function mint(event) {
  event.preventDefault();
  clearLog("#mint-log");
  const button = $("#mint-button");
  button.disabled = true;
  try {
    const signer = requireSigner();
    const form = event.target;
    const file = form.file.files[0];
    if (!file) throw new Error("Choose an artwork file.");
    if (!file.type.startsWith("image/")) throw new Error("The artwork must be an image.");

    const key = form.storage.value;
    const request = {
      file,
      name: buildNftName(form.title.value),
      description: form.description.value.trim(),
      receiver: receiverOrSelf(form.to.value),
    };

    const tokenId = key === "nft" ? await mintWithIpfs(signer, request) : await mintOnchain(signer, request);
    log("#mint-log", `✅ Minted “${request.name}” as token #${tokenId} (${key === "nft" ? "IPFS" : "on-chain"})`);
    await loadGallery();
  } catch (error) {
    log("#mint-log", `❌ ${errorMessage(error)}`);
  } finally {
    button.disabled = false;
  }
}

// ---------- Owner lookup and transfer ----------

async function lookupOwner(event) {
  event.preventDefault();
  const form = event.target;
  const result = $("#owner-result");
  if (!isDeployed(form.collection.value)) {
    result.replaceChildren(element("p", { className: "empty", textContent: "This collection is not deployed." }));
    return;
  }
  result.replaceChildren(element("p", { className: "empty", textContent: "Reading ownerOf…" }));
  try {
    const token = await readToken(form.collection.value, BigInt(form.tokenId.value));
    result.replaceChildren(
      element("p", { textContent: `ownerOf(${token.tokenId}) = ${token.owner}` }),
      tokenCard(token)
    );
  } catch (error) {
    result.replaceChildren(element("p", { className: "empty", textContent: `❌ ${errorMessage(error)}` }));
  }
}

async function transferToken(event) {
  event.preventDefault();
  clearLog("#transfer-log");
  try {
    const signer = requireSigner();
    const form = event.target;
    const key = form.collection.value;
    const tokenId = BigInt(form.tokenId.value);
    const receiver = form.to.value.trim();
    if (!ethers.isAddress(receiver)) throw new Error(`Invalid address: ${receiver}`);

    const contract = contractFor(key, signer);
    const transfer = contract["safeTransferFrom(address,address,uint256)"];
    log("#transfer-log", `safeTransferFrom(${state.account}, ${receiver}, ${tokenId})`);
    await transfer.staticCall(state.account, receiver, tokenId);
    const tx = await transfer(state.account, receiver, tokenId);
    log("#transfer-log", `Sent: ${tx.hash}`);
    await tx.wait();
    log("#transfer-log", `✅ New owner: ${await contract.ownerOf(tokenId)}`);
    await loadGallery();
  } catch (error) {
    log("#transfer-log", `❌ ${errorMessage(error)}`);
  }
}

// ---------- Start ----------

// ---------- Token page (#token/<collection>/<id>) ----------

// What each collection is: the mandatory/bonus difference, shown on the token page
const COLLECTION_INFO = {
  nft: {
    part: "Mandatory",
    title: "IPFS collection",
    storage: [
      "The contract only stores a link: tokenURI = ipfs://<metadata CID>.",
      "The metadata JSON and the image are files on IPFS, pinned on Pinata.",
      "A CID is the hash of the file: the content behind a token cannot be changed.",
    ],
    flow: [
      ["Contract", "tokenURI = ipfs://<metadata CID>"],
      ["IPFS", "metadata JSON (name, artist, image…)"],
      ["IPFS", "image file (ipfs://<image CID>)"],
    ],
  },
  inscriptions: {
    part: "Bonus",
    title: "On-chain inscriptions",
    storage: [
      "The image bytes and the metadata are stored inside the contract (inscription).",
      "tokenURI is built by the contract: data:application/json;base64,<JSON>.",
      "No IPFS, no server: the NFT only depends on Ethereum. finalize() freezes it forever.",
    ],
    flow: [
      ["Contract storage", "image bytes + name, description, mime type"],
      ["tokenURI()", "JSON built on the fly, base64 data: URI"],
      ["Image", "data:<mime>;base64,… decoded by the browser"],
    ],
  },
};

function detailRows(rows) {
  return element("dl", { className: "details" }, rows.flatMap(([label, value]) => [
    element("dt", { textContent: label }),
    element("dd", {}, [value]),
  ]));
}

function codeValue(text) {
  return element("code", { textContent: text });
}

// External https link (IPFS gateway, OpenSea), label shown as given
function externalLink(url, label) {
  return element("a", { href: url, target: "_blank", rel: "noopener", textContent: label });
}

// Long data: URIs are cut so the JSON stays readable
function shorten(text, max = 90) {
  return text.length > max ? `${text.slice(0, max)}… (${text.length} chars)` : text;
}

function metadataForDisplay(metadata) {
  if (!metadata) return "(metadata unavailable)";
  const copy = { ...metadata };
  if (typeof copy.image === "string") copy.image = shorten(copy.image);
  return JSON.stringify(copy, null, 2);
}

function section(title, children, className = "") {
  return element("section", { className: `card info ${className}` }, [element("h3", { textContent: title }), ...children]);
}

async function renderTokenPage(key, tokenId) {
  const page = $("#token-page");
  const message = (text) => page.replaceChildren(element("p", { className: "empty", textContent: text }));
  if (!COLLECTION_INFO[key] || !isDeployed(key)) return message("❌ Unknown collection.");
  message("Reading the contract…");

  const { address, contractName } = CONFIG.contracts[key];
  const info = COLLECTION_INFO[key];
  const contract = contractFor(key, state.readProvider);

  let token;
  let collection;
  try {
    const [readResult, name, symbol, contractOwner, artist, supply, finalized] = await Promise.all([
      readToken(key, tokenId),
      contract.name(), contract.symbol(), contract.owner(), contract.artist(), contract.totalSupply(),
      key === "inscriptions" ? contract.isFinalized(tokenId) : null,
    ]);
    token = readResult;
    collection = { name, symbol, contractOwner, artist, supply, finalized };
  } catch (error) {
    return message(`❌ ${errorMessage(error)}`);
  }
  const { owner, tokenURI, metadata } = token;
  const isYou = state.account && owner.toLowerCase() === state.account.toLowerCase();

  // Left: the artwork, always visible (sticky)
  const links = [explorerLink(`nft/${address}/${tokenId}`, "Etherscan")];
  if (CONFIG.network === "sepolia") {
    links.push(externalLink(`https://testnets.opensea.io/assets/sepolia/${address}/${tokenId}`, "OpenSea"));
  }
  const aside = element("aside", { className: "card token-aside" }, [
    imageElement(metadata?.image, metadata?.name || `Token ${tokenId}`),
    element("div", { className: "nft-body" }, [
      element("h2", { textContent: metadata?.name || `Token #${tokenId}` }),
      element("p", {}, [
        element("span", { className: "badge ok", textContent: info.part }), " ",
        element("span", { className: "muted", textContent: `${info.title} · #${tokenId}` }),
      ]),
      element("div", { className: "nft-meta" }, ["Artist: ", metadata?.artist || "?"]),
      element("div", { className: "nft-meta" }, ["Owner: ", explorerLink(`address/${owner}`, shortAddress(owner)), isYou ? " (you)" : ""]),
      element("div", { className: "row links" }, links),
    ]),
  ]);

  // Right: storage explanation, contract, token, metadata
  const flow = element("ol", { className: "flow" }, info.flow.map(([where, what]) =>
    element("li", {}, [element("strong", { textContent: where }), element("span", { textContent: what })])));

  const storageRows = [];
  if (key === "nft") {
    storageRows.push(["Metadata file", externalLink(ipfsToHttp(tokenURI), tokenURI)]);
    if (metadata?.image) storageRows.push(["Image file", externalLink(ipfsToHttp(metadata.image), metadata.image)]);
  } else {
    const match = /^data:([^;]+);base64,(.*)$/s.exec(metadata?.image || "");
    if (match) {
      const bytes = Math.floor((match[2].length * 3) / 4) - (match[2].match(/=+$/)?.[0].length || 0);
      storageRows.push(["Image", `${match[1]}, ${bytes} bytes in contract storage`]);
    }
    storageRows.push(["Finalized", collection.finalized ? "yes: frozen forever" : "no: the owner can still append image chunks"]);
  }

  const main = element("div", { className: "token-main" }, [
    section(`Where is it stored? · ${info.part} part`, [
      flow,
      element("ul", { className: "storage-notes" }, info.storage.map((line) => element("li", { textContent: line }))),
    ]),
    element("div", { className: "two-cols" }, [
      section("Contract", [detailRows([
        ["Contract", contractName],
        ["Address", explorerLink(`address/${address}#code`, address)],
        ["Standard", "ERC-721 + ERC-165 + Metadata"],
        ["Name", `${collection.name} (${collection.symbol})`],
        ["Owner", explorerLink(`address/${collection.contractOwner}`, collection.contractOwner)],
        ["Artist", collection.artist],
        ["Supply", `${collection.supply} token(s)`],
        ["Network", `${CONFIG.chainName} (${CONFIG.chainId})`],
      ])]),
      section("Token", [detailRows([
        ["Token id", tokenId.toString()],
        [`ownerOf(${tokenId})`, explorerLink(`address/${owner}`, owner)],
        [`tokenURI(${tokenId})`, codeValue(shorten(tokenURI, 70))],
        ...storageRows,
      ])]),
    ]),
    section("Metadata JSON", [element("pre", { className: "json", textContent: metadataForDisplay(metadata) })]),
  ]);

  page.replaceChildren(element("div", { className: "token-layout" }, [aside, main]));
}

// ---------- Navigation: tabs + #token/<collection>/<id> ----------

function showPanel(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
}

function openToken(key, tokenId) {
  location.hash = `token/${key}/${tokenId}`;
}

function route() {
  const match = /^#token\/(\w+)\/(\d+)$/.exec(location.hash);
  if (match) {
    showPanel("token");
    window.scrollTo(0, 0);
    renderTokenPage(match[1], BigInt(match[2]));
  } else {
    showPanel(state.currentTab);
  }
}

function setupTabs() {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => {
      state.currentTab = tab.dataset.tab;
      if (location.hash) location.hash = ""; // leaves the token page, route() shows the tab
      else showPanel(state.currentTab);
    });
  }
  window.addEventListener("hashchange", route);
}

async function start() {
  if (!CONFIG) {
    document.body.textContent = "Missing config.js. Run `make website` from the code/ folder.";
    return;
  }

  state.readProvider = new ethers.JsonRpcProvider(CONFIG.rpcUrl, CONFIG.chainId, { staticNetwork: true });
  setupTabs();

  $("#network-badge").textContent = CONFIG.chainName;
  $("#connect-button").addEventListener("click", () => connectWallet().catch((e) => alert(errorMessage(e))));
  $("#refresh-button").addEventListener("click", loadGallery);
  $("#mint-form").addEventListener("submit", mint);
  $("#mint-form").addEventListener("input", updateMintForm);
  $("#mint-form").addEventListener("change", updateMintForm);
  updateMintForm();
  checkIpfsUploads();
  $("#owner-form").addEventListener("submit", lookupOwner);
  $("#transfer-form").addEventListener("submit", transferToken);

  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", () => window.location.reload());
    window.ethereum.on?.("chainChanged", () => window.location.reload());
  }

  const footer = $("#footer");
  for (const key of ["nft", "inscriptions"]) {
    const { address, contractName } = CONFIG.contracts[key];
    if (!address) continue;
    if (footer.childNodes.length) footer.append(" · ");
    footer.append(`${contractName}: `, explorerLink(`address/${address}`, shortAddress(address)));
  }

  try {
    const artist = isDeployed("nft")
      ? await contractFor("nft", state.readProvider).artist()
      : isDeployed("inscriptions") ? await contractFor("inscriptions", state.readProvider).artist() : null;
    $("#collection-line").textContent = artist ? `Mokko 42 collection by ${artist}` : "No contract deployed yet";
  } catch (error) {
    $("#collection-line").textContent = `Cannot reach ${CONFIG.chainName}: ${errorMessage(error)}`;
  }

  route(); // a #token/... link opens the token page directly
  await loadGallery();
}

start();

// Bonus: tiny server for the website/ folder (no dependency needed).
// MetaMask only injects itself in pages served over http(s), not file://.
//
// It also uploads files to IPFS for the Mint page, with PINATA_JWT from code/.env:
// the JWT stays on this machine and is never sent to the browser.
//   GET  /api/ipfs  -> { enabled: true|false }  (is PINATA_JWT set?)
//   POST /api/ipfs  -> body = the file, header X-File-Name -> { cid }
const http = require("http");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const { pinataUpload } = require("./ipfs_upload.cjs");

const WEBSITE_DIR = path.join(__dirname, "..", "..", "website");
const PORT = Number(process.env.PORT || "8042");
const PINATA_JWT = process.env.PINATA_JWT;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Only the website itself may use the API. Another site open in the browser could otherwise
// send requests to localhost and pin files with our JWT:
// - Host must be ours (blocks DNS rebinding)
// - Origin, sent by browsers on POST, must be ours
// - the custom X-File-Name header makes cross-site requests need a CORS preflight, which we never accept
function isSameOrigin(request) {
  const allowedHosts = [`localhost:${PORT}`, `127.0.0.1:${PORT}`];
  const origin = request.headers.origin;
  return allowedHosts.includes(request.headers.host) &&
    (!origin || allowedHosts.some((host) => origin === `http://${host}`));
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    request.on("data", (part) => {
      size += part.length;
      if (size > MAX_UPLOAD_BYTES) {
        reject(new Error("File too big (50 MB max)"));
        request.destroy();
        return;
      }
      parts.push(part);
    });
    request.on("end", () => resolve(Buffer.concat(parts)));
    request.on("error", reject);
  });
}

async function handleIpfs(request, response) {
  if (!isSameOrigin(request)) return sendJson(response, 403, { error: "Forbidden origin" });
  if (request.method === "GET") return sendJson(response, 200, { enabled: Boolean(PINATA_JWT) });
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
  if (!PINATA_JWT) return sendJson(response, 503, { error: "PINATA_JWT is missing in code/.env" });

  const fileName = request.headers["x-file-name"];
  if (!fileName) return sendJson(response, 400, { error: "Missing X-File-Name header" });

  try {
    const content = await readBody(request);
    const mimeType = request.headers["content-type"] || "application/octet-stream";
    const cid = await pinataUpload(PINATA_JWT, decodeURIComponent(fileName), content, mimeType);
    console.log(`Pinned ${decodeURIComponent(fileName)} (${content.length} bytes): ipfs://${cid}`);
    sendJson(response, 200, { cid });
  } catch (error) {
    sendJson(response, 502, { error: error.message });
  }
}

function serveFile(request, response) {
  const urlPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.join(WEBSITE_DIR, urlPath === "/" ? "index.html" : urlPath);

  // Refuse paths escaping the website folder (../../.env for example)
  if (!file.startsWith(WEBSITE_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
}

const server = http.createServer((request, response) => {
  if (new URL(request.url, "http://localhost").pathname === "/api/ipfs") {
    handleIpfs(request, response);
  } else {
    serveFile(request, response);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`TokenizeArt website: http://localhost:${PORT} (Ctrl+C to stop)`);
  console.log(PINATA_JWT ? "IPFS uploads: enabled (PINATA_JWT from code/.env)" : "IPFS uploads: disabled (no PINATA_JWT in code/.env)");
});

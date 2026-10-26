# Usage guide

Every command runs from the `code/` folder. `make help` lists them all.

## 1. Requirements

- Linux or macOS with `make`, `curl` and `tar`. Node 22 is used if it is installed; otherwise the
  Makefile downloads a local copy into `code/.tools/`.
- Two Sepolia wallets with a little test ETH (faucets: Google Cloud Web3 faucet, Alchemy, Infura).
- A free [Pinata](https://app.pinata.cloud) account, for IPFS.
- Optional: an Etherscan API key to verify the sources.

## 2. Setup

```sh
cd code
cp .env.example .env     # then fill it (see below)
make install
make test                # 19 tests on a local chain, no gas
```

| `.env` variable | Purpose |
|---|---|
| `SEPOLIA_RPC` | Sepolia RPC URL (the public endpoint works) |
| `PRIVATE_KEY` | wallet 1: deployer = contract owner = the only one allowed to mint |
| `PRIVATE_KEY2` | wallet 2: a regular user (transfer and security demos) |
| `ARTIST_LOGIN` | the 42 login written as artist (`maagosti`) |
| `PINATA_JWT` | Pinata → *API Keys* → *New Key* (Admin, or pinning permissions) → copy the **JWT** |
| `ETHERSCAN_API_KEY` | for `make verify` |

`.env` is in `.gitignore`: never commit private keys.

## 3. Mandatory part: IPFS collection

```sh
# a) Upload the image + its metadata JSON to IPFS
make ipfs-upload ARTWORK=../mint/artworks/42-bocal.png TITLE="Best Bocal"
#    -> mint/metadata/42-best-bocal.json and mint/ipfs.json (image and metadata CIDs)

# b) Deploy the contract (only once; already done on Sepolia)
make deploy
#    -> deployment/sepolia.json

# c) Mint the last uploaded metadata to wallet 1 (or MINT_TO=0x...)
make mint

# d) Show the owner (ownerOf), tokenURI and metadata
make show            # or: make owner TOKEN_ID=1
#    Metadata is fetched from Pinata, dweb.link, then ipfs.io (public gateways
#    rate-limit with HTTP 429). Force one with IPFS_GATEWAY=https://.../ipfs/

# e) Transfer: wallet 1 -> wallet 2, then back
make transfer TOKEN_ID=1
make transfer TOKEN_ID=1 FROM=2

# f) Verify the source on Etherscan
make verify
```

No Pinata JWT? Upload the image in the Pinata web UI (or with `ipfs add`), then run
`make ipfs-upload ... IMAGE_CID=<cid>`. The script writes the metadata JSON in `mint/metadata/`.
Upload that file the same way and run `make mint METADATA_URI=ipfs://<metadata cid>`.

## 4. Bonus: on-chain collection

```sh
make onchain-deploy
make onchain-mint ARTWORK=../mint/artworks/42-bocal-onchain.webp TITLE="Best Bocal"   # max 32 KB
make onchain-show                       # decodes tokenURI; writes the image to mint/onchain/
make onchain-transfer TOKEN_ID=1
make onchain-verify
```

`onchain-mint` splits the image into 12 000-byte chunks (`CHUNK_SIZE=`), sends `mint` then one
`appendImage` per remaining chunk, then `finalize`. Finally it checks that the bytes read back from
the chain are identical to the file.

## 5. Security demo

```sh
make security
```

Using wallet 2 as the attacker, it simulates (with `staticCall`, so free and with nothing sent) a mint,
a `transferOwnership`, theft of a token, self-approval and modification of an artwork. Each one must
come back **refused**, with the contract's revert reason. See [security.md](security.md).

## 6. Bonus: website

```sh
make website            # generates website/config.js, serves http://localhost:8042
```

| Tab | What it does |
|---|---|
| Gallery | two sections, one per contract: **Mandatory: IPFS** (`Mokko42NFT`) and **Bonus: on-chain** (`Mokko42Inscriptions`). Each token shows its image, name, artist and owner. The same artwork minted in both contracts is two different NFTs, so it appears once in each section. **Click a token** to open its page (shareable link `#token/<nft|inscriptions>/<id>`): the artwork stays on the left, with cards on the right for where it is stored (mandatory vs bonus), its contract (address, standard, name, symbol, owner, artist, supply), the token (`ownerOf`, raw `tokenURI`, where the metadata and image are stored) and the full metadata JSON. IPFS files are loaded through Pinata, then Filebase, dweb.link or ipfs.io if a gateway rate-limits |
| Mint | owner wallet only. Choose the image, type a title (the name becomes “42 - title”), pick where it is stored, press **Mint**. **IPFS** (any size): the page uploads the image and the metadata JSON to IPFS, then calls `mint`. **On-chain** (32 KB max, disabled for bigger files): the page sends `mint` → `appendImage`… → `finalize`, one MetaMask signature each. *Advanced* lets you mint to another address. |
| Who owns it? | calls `ownerOf` for a collection and token id |
| Transfer | `safeTransferFrom` the connected wallet's token to an address |

Reads go through a public RPC, so no wallet is needed to browse. Writes are signed by MetaMask
(switch it to Sepolia). The website only hides buttons; permissions are enforced by the contracts.
A wallet that is not the contract owner is shown as *Collector*, and its mint is refused with the
contract's revert reason.

IPFS uploads go through the local server started by `make website`. It reads `PINATA_JWT` from
`code/.env` and pins the files on Pinata, so the JWT never reaches the browser. The upload endpoint
(`/api/ipfs`) only accepts requests from the website itself (checks on `Host` and `Origin`, and a
custom header that forces a CORS preflight), so other sites open in the browser cannot use your JWT.
Without `PINATA_JWT`, the IPFS option says it is unavailable and only on-chain minting works.

## 7. Local chain (optional, free)

```sh
make local-node                                       # terminal 1
make deploy NETWORK=localhost && make onchain-deploy NETWORK=localhost   # terminal 2, etc.
```

Every blockchain command accepts `NETWORK=localhost`. Hardhat's funded test accounts replace the `.env` keys.

## 8. Without the Makefile

Each contract is verified on Etherscan. Open the address, go to **Contract → Read Contract**
(`ownerOf`, `tokenURI`, `balanceOf`, ...) or **Write Contract** (connect MetaMask) to interact with
it directly.

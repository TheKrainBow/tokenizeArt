# TokenizeArt: MokkoAt42 NFT collection

An ERC-721 NFT collection by **maagosti**, deployed on the **Ethereum Sepolia** testnet.

| | |
|---|---|
| Network | Ethereum **Sepolia** testnet (chain id `11155111`) |
| Artist (login) | `maagosti` |
| Mandatory contract (IPFS) | `Mokko42NFT` at [`0x020679bCebe58e02F989FD2e93af48A865Ac3Ec7`](https://sepolia.etherscan.io/address/0x020679bCebe58e02F989FD2e93af48A865Ac3Ec7#code) (source verified) |
| Bonus contract (on-chain) | `Mokko42Inscriptions` at [`0x4a50b8199603ED1f45f55F5A2Ae5107947C544D0`](https://sepolia.etherscan.io/address/0x4a50b8199603ED1f45f55F5A2Ae5107947C544D0#code) (source verified) |
| Contract owner | `0x6f2CBd6191aaE03b8123Fcd5a4e8d255Cb2a2743` |
| Artworks | IPFS: [`mint/artworks/42-bocal.png`](mint/artworks/42-bocal.png) "42 - Best Bocal"; on-chain: [`mint/artworks/42-bocal-onchain.webp`](mint/artworks/42-bocal-onchain.webp) (384×384, 28 KB version) |

Every deployment and mint is also recorded in [`deployment/sepolia.json`](deployment/sepolia.json)
(addresses, transaction hashes, token ids, token URIs).

**Minted tokens**

- `Mokko42Inscriptions` #1, "42 - Best Bocal", stored fully on-chain:
  [Etherscan](https://sepolia.etherscan.io/nft/0x4a50b8199603ED1f45f55F5A2Ae5107947C544D0/1),
  [OpenSea testnet](https://testnets.opensea.io/assets/sepolia/0x4a50b8199603ED1f45f55F5A2Ae5107947C544D0/1)
- `Mokko42NFT` #1, "42 - Best Bocal", with its image and metadata on IPFS:
  [Etherscan](https://sepolia.etherscan.io/nft/0x020679bCebe58e02F989FD2e93af48A865Ac3Ec7/1),
  [OpenSea testnet](https://testnets.opensea.io/assets/sepolia/0x020679bCebe58e02F989FD2e93af48A865Ac3Ec7/1).
  - tokenURI: `ipfs://bafkreieutd5aybbgdymw2vpzfqiey45gvwyocnfguwokpdhlkb3b5lkacu`
    ([metadata](https://gateway.pinata.cloud/ipfs/bafkreieutd5aybbgdymw2vpzfqiey45gvwyocnfguwokpdhlkb3b5lkacu))
  - image: `ipfs://bafybeidgq3pfjrmxekjmxpjky5brgqifkpw6gaxjfc4emangn764okstg4`
    ([view](https://gateway.pinata.cloud/ipfs/bafybeidgq3pfjrmxekjmxpjky5brgqifkpw6gaxjfc4emangn764okstg4))

## Repository layout

```
README.md        this file: choices and their reasons
code/            Solidity contracts, tests, Hardhat scripts, Makefile
deployment/      deployed addresses and transactions, per network (sepolia.json)
mint/            the artwork, the metadata JSON and the IPFS upload records
documentation/   how the project works and how to use it
website/         bonus: web interface to browse, mint, check owners and transfer
```

## Quick demo

```sh
cd code
make install                 # Node 22 (local copy if needed) + dependencies
make test                    # 19 tests on a local in-memory chain (free)
make show                    # ownerOf + tokenURI + metadata of the IPFS NFT
make onchain-show            # same for the on-chain NFT; decodes the image into mint/onchain/
make security                # proves that a non-owner cannot mint, steal or modify anything
make transfer                # safeTransferFrom wallet 1 -> wallet 2, then shows the new owner
make website                 # http://localhost:8042
```

For the full guide, see [`documentation/`](documentation/README.md).

## Choices and why

### Blockchain: Ethereum Sepolia
- The subject accepts any blockchain that follows its NFT standard (ERC-721 on Ethereum, BEP-721 on BSC).
  Sepolia is Ethereum's official long-term testnet, so the tokens follow the reference standard, ERC-721.
- Free test ETH is easy to get from public faucets, and no real money is involved.
- Etherscan Sepolia can verify the source code and show the NFT, and OpenSea testnets displays the
  images. A reviewer can check everything in a browser, without installing anything.
- The same contracts would run unchanged on BSC Testnet, because BEP-721 is ERC-721 on an EVM chain.
  Only the network entry in `hardhat.config.js` would change.

### Language and tooling: Solidity + Hardhat
- Solidity is the native language of the EVM. Hardhat compiles the contracts, runs the tests on an
  in-memory chain, deploys, and verifies the sources on Etherscan, all from one tool.
- A `Makefile` wraps every action, so the demo is a few short commands. It downloads its own Node 22
  if the machine has an older one.

### ERC-721 from OpenZeppelin
- The standard comes from [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/5.x/) `5.7.0`,
  the audited reference implementation used by most production NFTs:
  - `ERC721` covers the whole EIP-721 interface (`balanceOf`, `ownerOf`, `approve`,
    `setApprovalForAll`, `transferFrom`, `safeTransferFrom`, events), plus ERC-165 and the Metadata
    extension (`name`, `symbol`, `tokenURI`).
  - `ERC721URIStorage` stores one `ipfs://` URI per token (IPFS collection).
  - `Ownable` restricts minting to the contract owner.
  - `Base64` builds the `data:` URIs of the on-chain collection.
- Reusing audited code for the standard is safer than rewriting it. Our contracts only contain what
  is specific to this project: minting, the artist login, and on-chain image storage.
- Errors are OpenZeppelin's custom errors, for example `OwnableUnauthorizedAccount(address)` or
  `ERC721NonexistentToken(tokenId)`. The scripts and the website decode them into readable messages.
- Compiler: Solidity `0.8.28` targeting the Cancun EVM (OpenZeppelin 5.7 uses the `mcopy` opcode),
  which Sepolia supports.

### Security model
- **Minting is restricted to the contract owner** (`onlyOwner`). No one else can create tokens.
- **Only a token's owner, or an address they approved, can move it.** The contract enforces this
  through the standard ERC-721 approval system, not a server or the website.
- `safeTransferFrom` refuses to send an NFT to a contract that cannot handle it, so tokens are not locked forever.
- Metadata cannot be modified after mint: there is no setter for `tokenURI`. On-chain artworks are
  frozen by `finalize`.
- Private keys live only in `code/.env`, which git ignores. The website never handles keys: it uses
  the visitor's wallet (MetaMask).
- `make security` runs these attacks against the live contracts as free simulated calls and shows the revert reasons.

### Image and metadata on IPFS (mandatory)
- IPFS addresses content by its hash (CID), so the image cannot be swapped without changing its link.
  We pin through **Pinata** so the files stay available.
- The metadata JSON follows the format that wallets, Etherscan and OpenSea read:
  `name` (always `42 - <title>`), `description`, `image` (`ipfs://...`), `artist` = `maagosti`, and
  `attributes`.
- The contract stores `ipfs://<metadata CID>` as the `tokenURI`.

### Bonus
- **Inscriptions:** `Mokko42Inscriptions` stores the image bytes and metadata in contract storage, and
  `tokenURI` returns a base64 `data:` URI built on the fly, so the NFT depends on neither IPFS nor a server.
  Large images are uploaded in chunks (`mint` → `appendImage` → `finalize`). The contract requires the
  name to contain "42" and rejects characters that could break the JSON.
- **Website:** [`website/`](website/) (`make website`) lets you browse both collections and mint them
  from a graphical interface. For IPFS, the page uploads the image and metadata to Pinata and then
  mints. For on-chain, it uploads the image in chunks and finalizes it. You can also check `ownerOf`
  and transfer, all through MetaMask. The only backend is the small local server started by
  `make website`. It pins files on Pinata with `PINATA_JWT` from `code/.env`, so the key never
  reaches the browser. Only the contract owner's wallet can mint, and the contract refuses anyone else.
- **Size limit for on-chain images:** `tokenURI` is a read-only call, but RPC nodes cap its gas
  (16.7M on publicnode). It costs ~240 gas per image byte (reading storage, then base64 twice), so the
  on-chain version of the artwork is a 384×384 WebP of 28 KB (~6.7M gas). `make onchain-mint` refuses
  anything above 32 KB, because a finalized token that cannot be read can never be fixed.

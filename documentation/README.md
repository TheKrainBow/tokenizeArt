# TokenizeArt documentation

| File | Content |
|---|---|
| [README.md](README.md) | This page: what the NFT is, what it represents, how it works |
| [usage.md](usage.md) | Setup and step-by-step guide: deploy, mint, show, transfer, website |
| [contracts.md](contracts.md) | Reference for every contract function and event |
| [security.md](security.md) | Who can do what, and how to demonstrate it |
| [metadata.md](metadata.md) | Metadata format, IPFS storage and on-chain storage |

## What it is

**MokkoAt42** is an NFT art collection by the 42 student **maagosti**. Each token is a unique artwork
that contains the number **42**. Owning the token proves on the blockchain that you own that artwork:
anyone can check the owner with `ownerOf(tokenId)`, and only the owner can transfer it.

There are two collections:

| | `Mokko42NFT` (mandatory) | `Mokko42Inscriptions` (bonus) |
|---|---|---|
| Symbol | `M42ART` | `M42INS` |
| Image | on IPFS | in contract storage |
| Metadata | JSON file on IPFS | JSON built by the contract |
| `tokenURI` returns | `ipfs://<metadata CID>` | `data:application/json;base64,...` |
| Depends on | IPFS pinning (Pinata) | nothing but Ethereum |
| Sepolia address | `0x020679bCebe58e02F989FD2e93af48A865Ac3Ec7` | `0x4a50b8199603ED1f45f55F5A2Ae5107947C544D0` |

Both are standard **ERC-721** contracts on **Ethereum Sepolia** (chain id `11155111`), so any
ERC-721 wallet, explorer or marketplace can read them (MetaMask, Etherscan, OpenSea testnets).

## How it works

```
                 make ipfs-upload                       make mint
artwork.png ───────────────────────▶ IPFS ────────────────────────────▶ Mokko42NFT
                 image CID + metadata JSON CID          tokenURI = ipfs://<metadata CID>
                                                       ownerOf(id) = receiver

                 make onchain-mint
artwork.webp ──────────────────────────────────────────────────────▶ Mokko42Inscriptions
                 mint(first chunk) → appendImage(...) → finalize        bytes stored on-chain
```

1. **Create** an artwork containing "42" (see [`mint/artworks/`](../mint/artworks/)).
2. **Store** it: either on IPFS with its metadata JSON, or directly inside the contract (bonus).
3. **Mint**: the contract owner calls `mint`. The contract gives the token a new id
   (1, 2, 3, ...), records the receiver as its owner, and emits `Transfer(0x0, receiver, id)`.
4. **Display**: wallets call `tokenURI(id)`, read the JSON and show the `image`.
5. **Own and trade**: the holder can `transferFrom` / `safeTransferFrom` the token, or approve
   someone else to do it. `ownerOf(id)` always returns the current owner.

## Roles

| Role | Address (Sepolia) | Can |
|---|---|---|
| Contract owner | `0x6f2CBd6191aaE03b8123Fcd5a4e8d255Cb2a2743` (`PRIVATE_KEY`) | mint, add image chunks / finalize (on-chain), hand over ownership |
| Token holder | whoever `ownerOf(id)` returns | transfer that token, approve others |
| Approved address / operator | set by a holder | transfer the approved token(s) |
| Anyone | | read everything: `ownerOf`, `tokenURI`, `balanceOf`, ... |

## Where to check

- IPFS contract: https://sepolia.etherscan.io/address/0x020679bCebe58e02F989FD2e93af48A865Ac3Ec7#code
- On-chain contract: https://sepolia.etherscan.io/address/0x4a50b8199603ED1f45f55F5A2Ae5107947C544D0#code
- IPFS token #1 ("42 - Best Bocal"): https://testnets.opensea.io/assets/sepolia/0x020679bCebe58e02F989FD2e93af48A865Ac3Ec7/1
- On-chain token #1: https://testnets.opensea.io/assets/sepolia/0x4a50b8199603ED1f45f55F5A2Ae5107947C544D0/1
- Every transaction hash: [`deployment/sepolia.json`](../deployment/sepolia.json)

On Etherscan, open **Contract → Read Contract → ownerOf**, type a token id, and the current
owner is returned with no wallet needed.

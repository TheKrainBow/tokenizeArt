# Contracts reference

Solidity `0.8.28` (Cancun EVM), optimizer on (200 runs). Sources are in [`code/contracts/`](../code/contracts/).
The ERC-721 standard, access control and Base64 come from
[OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/5.x/) `5.7.0` (`@openzeppelin/contracts`).

```
      OpenZeppelin                          this project
ERC721 ─▶ ERC721URIStorage ─┐
                            ├─▶ Mokko42NFT            (IPFS, mandatory)
Ownable ────────────────────┤
ERC721 ─────────────────────┼─▶ Mokko42Inscriptions   (on-chain, bonus)
Base64 (library) ───────────┘
```

## Inherited from OpenZeppelin: the ERC-721 standard

| Function | Who | Description |
|---|---|---|
| `name()`, `symbol()` | anyone | collection name and symbol |
| `balanceOf(owner)` | anyone | number of tokens held by `owner` (reverts for `0x0`) |
| `ownerOf(tokenId)` | anyone | current owner; reverts `ERC721NonexistentToken(id)` |
| `tokenURI(tokenId)` | anyone | metadata URI (see each collection) |
| `approve(to, tokenId)` | holder or operator | lets `to` transfer this one token |
| `getApproved(tokenId)` | anyone | the approved address for a token |
| `setApprovalForAll(operator, bool)` | anyone (for their own tokens) | lets `operator` manage all the caller's tokens |
| `isApprovedForAll(owner, operator)` | anyone | |
| `transferFrom(from, to, id)` | holder, approved, operator | moves the token; clears the single approval |
| `safeTransferFrom(from, to, id[, data])` | holder, approved, operator | same, but refuses contracts that don't implement `onERC721Received` |
| `supportsInterface(id)` | anyone | ERC-165 `0x01ffc9a7`, ERC-721 `0x80ac58cd`, Metadata `0x5b5e139f` (+ ERC-4906 `0x49064906` for `Mokko42NFT`) |

Events: `Transfer`, `Approval`, `ApprovalForAll`. A mint emits `Transfer(0x0, to, id)`.

## Inherited from OpenZeppelin: Ownable

| | |
|---|---|
| `owner()` | the address allowed to call `onlyOwner` functions (the deployer, set by `Ownable(msg.sender)`) |
| `transferOwnership(newOwner)` | owner only; refuses `0x0` |
| `renounceOwnership()` | owner only; leaves the contract without owner, so nobody can mint any more |
| event `OwnershipTransferred(previous, new)` | |

The contract owner (the minting privilege) and the token holders are separate roles. Being the
contract owner gives **no** right over tokens held by other people.

## Errors

OpenZeppelin reverts with custom errors instead of text. The ones you will see:

| Error | When |
|---|---|
| `OwnableUnauthorizedAccount(account)` | a non-owner calls `mint`, `appendImage`, `finalize`, `transferOwnership` |
| `OwnableInvalidOwner(0x0)` | `transferOwnership(0x0)` |
| `ERC721NonexistentToken(id)` | reading or modifying a token that was never minted |
| `ERC721InsufficientApproval(operator, id)` | moving a token without being its holder, approved or operator |
| `ERC721InvalidApprover(approver)` | `approve` by someone who is neither the holder nor an operator |
| `ERC721IncorrectOwner(from, id, owner)` | `transferFrom` with a wrong `from` |
| `ERC721InvalidReceiver(to)` | mint/transfer to `0x0`, or a safe transfer to a contract that cannot receive NFTs |
| `ERC721InvalidOperator(0x0)` | `setApprovalForAll(0x0, …)` |

The project's own checks keep text messages: `"Empty metadata URI"`, `"Name must contain 42"`,
`"Mime type required"`, `"Empty image chunk"`, `"Text has forbidden characters"`, `"Artwork is finalized"`.

## Mokko42NFT: IPFS collection (mandatory)

`ERC721URIStorage, Ownable`. `constructor(artistLogin)`: name `MokkoAt42Art`, symbol `M42ART`.

| | |
|---|---|
| `artist()` | the 42 login (`maagosti`) |
| `totalSupply()` | number of minted tokens; ids go from 1 to `totalSupply` |
| `mint(to, metadataURI)` | **owner only**. Stores the URI, mints the next id to `to` with `_safeMint`, returns the id |
| `tokenURI(id)` | the `ipfs://...` stored at mint. There is no setter: it cannot be changed |
| event `Minted(tokenId, to, tokenURI)` | |

## Mokko42Inscriptions: on-chain collection (bonus)

`ERC721, Ownable`. `constructor(artistLogin)`: name `MokkoAt42Inscriptions`, symbol `M42INS`.

| | |
|---|---|
| `mint(to, artworkName, description, mimeType, firstChunk)` | **owner only**. `artworkName` must contain `42`; text must not contain `"`, `\` or control characters |
| `appendImage(id, chunk)` | **owner only**, before `finalize`: appends image bytes |
| `finalize(id)` | **owner only**, irreversible: freezes image and metadata |
| `isFinalized(id)` | |
| `imageData(id)` | raw image bytes (all chunks concatenated) |
| `imageURI(id)` | `data:<mime>;base64,...` (OpenZeppelin `Base64`) |
| `tokenURI(id)` | `data:application/json;base64,<JSON>`, with the same fields as the IPFS metadata plus a `Finalized` attribute |
| events `Inscribed`, `ImageChunkAppended`, `ArtworkFinalized` | |

Chunks exist because a transaction is limited by the block gas limit, so a large image cannot be
stored in a single call. Reading costs gas too: `tokenURI` for the 28 KB artwork needs ~6.7M gas
(the RPC limit for read-only calls is 16.7M), which is why images are capped at 32 KB.

## Tests

[`code/test/`](../code/test/) contains 19 tests (`make test`). They cover metadata, ERC-165, mint
permissions, `ownerOf`, transfers, approvals and operators, safe transfers to non-receivers, the
ownership handover, chunked image storage, base64 encoding, finalization and input validation.
They check the exact OpenZeppelin custom errors (`revertedWithCustomError`).

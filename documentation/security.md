# Security: ownership and privileges

## Who can do what

| Action | Contract owner | Token holder | Approved / operator | Anyone else |
|---|:-:|:-:|:-:|:-:|
| Read (`ownerOf`, `tokenURI`, ...) | ✅ | ✅ | ✅ | ✅ |
| `mint` | ✅ | ❌ | ❌ | ❌ |
| `appendImage` / `finalize` (on-chain, before finalize) | ✅ | ❌ | ❌ | ❌ |
| Modify an artwork after `finalize` | ❌ | ❌ | ❌ | ❌ |
| Change a `tokenURI` (IPFS) | ❌ (no such function) | ❌ | ❌ | ❌ |
| Transfer a token | ❌ unless holder/approved | ✅ | ✅ | ❌ |
| `approve` a token | ❌ unless holder/operator | ✅ | operator ✅ | ❌ |
| `transferOwnership` / `renounceOwnership` | ✅ | ❌ | ❌ | ❌ |

## Protections in the code

The ERC-721 rules and access control come from OpenZeppelin Contracts 5.7.0 (audited, the reference
implementation), so they are not re-implemented here:

- OpenZeppelin `Ownable`: the `onlyOwner` modifier is on every privileged function (`mint`,
  `appendImage`, `finalize`). Other callers get `OwnableUnauthorizedAccount(caller)`.
- OpenZeppelin `ERC721`: every transfer checks that the caller is the holder, approved for the token,
  or an operator (`ERC721InsufficientApproval`). It also checks that `from` is the real owner and
  that `to` is not `0x0`.
- The single-token approval is cleared on every transfer, so an old approval cannot be reused after a sale.
- `safeTransferFrom` and `_safeMint` call `onERC721Received` on contract receivers and refuse those
  that don't answer correctly, so tokens cannot be locked forever.
- Mint and transfer to `0x0` are refused, and so are reads of nonexistent tokens.
- Solidity ≥ 0.8 reverts on overflow and underflow.
- On-chain metadata is built by string concatenation, so `mint` rejects `"`, `\` and control characters.
  Otherwise someone could inject fields into the JSON.
- `tokenURI` is written once. `finalize` makes on-chain artworks immutable.

## Keys

- Private keys and the Pinata JWT are only in `code/.env`, which `.gitignore` excludes. `.env.example`
  shows the format without values.
- The Pinata JWT is used by the scripts and by the local `make website` server only, never sent to the
  browser. The server's upload endpoint refuses requests from other origins.
- The website never sees a private key: transactions are signed in the user's MetaMask.
  `website/config.js` only contains public RPC URLs, addresses and ABIs.

## Demonstration on Sepolia

```sh
cd code
make security
```

Wallet 2 (`PRIVATE_KEY2`) plays the attacker. Every action is a simulated call: the node runs it
and returns the revert reason, but no transaction is sent. Result on Sepolia:

```
Mokko42NFT (0x020679bCebe58e02F989FD2e93af48A865Ac3Ec7)
  ✅ Non-owner mint: refused -> "OwnableUnauthorizedAccount(0xb801…7d90)"
  ✅ Non-owner transferOwnership: refused -> "OwnableUnauthorizedAccount(0xb801…7d90)"
  ✅ Steal token 1 from 0x6f2C…2743: refused -> "ERC721InsufficientApproval(0xb801…7d90, 1)"
  ✅ Approve self on token 1: refused -> "ERC721InvalidApprover(0xb801…7d90)"
  ✅ Read a nonexistent token: refused -> "ERC721NonexistentToken(999999)"

Mokko42Inscriptions (0x4a50b8199603ED1f45f55F5A2Ae5107947C544D0)
  ✅ Non-owner mint: refused -> "OwnableUnauthorizedAccount(0xb801…7d90)"
  ✅ Non-owner transferOwnership: refused -> "OwnableUnauthorizedAccount(0xb801…7d90)"
  ✅ Steal token 1 from 0x6f2C…2743: refused -> "ERC721InsufficientApproval(0xb801…7d90, 1)"
  ✅ Approve self on token 1: refused -> "ERC721InvalidApprover(0xb801…7d90)"
  ✅ Modify artwork of token 1: refused -> "OwnableUnauthorizedAccount(0xb801…7d90)"
  ✅ Read a nonexistent token: refused -> "ERC721NonexistentToken(999999)"
```

To show a legitimate transfer and then a refused one:

```sh
make transfer TOKEN_ID=1            # wallet 1 sends token 1 to wallet 2
make show TOKEN_ID=1                # ownerOf -> wallet 2
make transfer TOKEN_ID=1            # wallet 1 tries again: refused, it is no longer the holder
make transfer TOKEN_ID=1 FROM=2     # wallet 2 sends it back
```

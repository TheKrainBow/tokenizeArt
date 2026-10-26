// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Mokko42NFT - ERC-721 collection whose artworks and metadata live on IPFS
/// @notice Each token points to a JSON metadata file stored on IPFS
///         (`ipfs://<CID>`). The metadata contains the name (with 42 and a title),
///         the artist login and the IPFS link of the image.
/// @dev The ERC-721 standard (ownership, transfers, approvals, safe transfers, ERC-165)
///      comes from OpenZeppelin. ERC721URIStorage stores one URI per token, and
///      Ownable restricts minting to the contract owner.
contract Mokko42NFT is ERC721URIStorage, Ownable {
    /// @notice 42 login of the artist, also written in every metadata file.
    string public artist;

    /// @notice Number of tokens minted so far. Token ids go from 1 to totalSupply.
    uint256 public totalSupply;

    event Minted(uint256 indexed tokenId, address indexed to, string tokenURI);

    constructor(string memory artistLogin) ERC721("MokkoAt42Art", "M42ART") Ownable(msg.sender) {
        require(bytes(artistLogin).length > 0, "Artist login required");
        artist = artistLogin;
    }

    /// @notice Mint a new NFT to `to` pointing to `metadataURI`. Owner only.
    ///         The URI is written once and cannot be changed afterwards.
    /// @return tokenId The id of the new token.
    function mint(address to, string calldata metadataURI) external onlyOwner returns (uint256 tokenId) {
        require(bytes(metadataURI).length > 0, "Empty metadata URI");

        tokenId = ++totalSupply;
        _setTokenURI(tokenId, metadataURI);
        _safeMint(to, tokenId); // reverts for 0x0 and for contracts that cannot receive NFTs
        emit Minted(tokenId, to, metadataURI);
    }
}

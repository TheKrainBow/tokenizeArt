// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title Mokko42Inscriptions - ERC-721 collection fully stored on-chain (bonus)
/// @notice Image bytes and metadata are written in contract storage. `tokenURI`
///         builds the JSON metadata on the fly and returns it as a base64 `data:`
///         URI, so the NFT does not depend on IPFS or any server.
/// @dev A transaction has a gas limit, so big images are uploaded in several
///      chunks: `mint` (first chunk) -> `appendImage` (next chunks) -> `finalize`.
///      Once finalized, the artwork can never be modified again.
///      ERC-721, Ownable and Base64 come from OpenZeppelin.
contract Mokko42Inscriptions is ERC721, Ownable {
    struct Artwork {
        string artworkName;  // must contain "42", e.g. "42 - My Title"
        string description;
        string mimeType;     // e.g. "image/svg+xml", "image/webp"
        bytes[] imageChunks; // concatenated in order to rebuild the image
        bool finalized;      // true = image and metadata are frozen forever
    }

    /// @notice 42 login of the artist, written in every metadata JSON.
    string public artist;

    /// @notice Number of tokens minted so far. Token ids go from 1 to totalSupply.
    uint256 public totalSupply;

    mapping(uint256 => Artwork) private _artworks;

    event Inscribed(uint256 indexed tokenId, address indexed to, string artworkName);
    event ImageChunkAppended(uint256 indexed tokenId, uint256 chunkIndex, uint256 chunkSize);
    event ArtworkFinalized(uint256 indexed tokenId);

    /// @dev Reverts with ERC721NonexistentToken for unknown ids, and once the artwork is frozen.
    modifier notFinalized(uint256 tokenId) {
        _requireOwned(tokenId);
        require(!_artworks[tokenId].finalized, "Artwork is finalized");
        _;
    }

    constructor(string memory artistLogin) ERC721("MokkoAt42Inscriptions", "M42INS") Ownable(msg.sender) {
        require(bytes(artistLogin).length > 0, "Artist login required");
        require(_isJsonSafe(artistLogin), "Artist login has forbidden characters");
        artist = artistLogin;
    }

    // --- Owner actions ---

    /// @notice Mint a new on-chain NFT with the first chunk of its image. Owner only.
    function mint(
        address to,
        string calldata artworkName,
        string calldata description,
        string calldata mimeType,
        bytes calldata firstImageChunk
    ) external onlyOwner returns (uint256 tokenId) {
        require(_contains42(artworkName), "Name must contain 42");
        require(bytes(mimeType).length > 0, "Mime type required");
        require(firstImageChunk.length > 0, "Empty image chunk");
        require(
            _isJsonSafe(artworkName) && _isJsonSafe(description) && _isJsonSafe(mimeType),
            "Text has forbidden characters"
        );

        tokenId = ++totalSupply;

        Artwork storage artwork = _artworks[tokenId];
        artwork.artworkName = artworkName;
        artwork.description = description;
        artwork.mimeType = mimeType;
        artwork.imageChunks.push(firstImageChunk);

        _safeMint(to, tokenId);
        emit Inscribed(tokenId, to, artworkName);
        emit ImageChunkAppended(tokenId, 0, firstImageChunk.length);
    }

    /// @notice Add the next chunk of image bytes. Owner only, before finalization.
    function appendImage(uint256 tokenId, bytes calldata imageChunk) external onlyOwner notFinalized(tokenId) {
        require(imageChunk.length > 0, "Empty image chunk");

        bytes[] storage chunks = _artworks[tokenId].imageChunks;
        chunks.push(imageChunk);
        emit ImageChunkAppended(tokenId, chunks.length - 1, imageChunk.length);
    }

    /// @notice Freeze the artwork: no more chunks can be added. Owner only, irreversible.
    function finalize(uint256 tokenId) external onlyOwner notFinalized(tokenId) {
        _artworks[tokenId].finalized = true;
        emit ArtworkFinalized(tokenId);
    }

    // --- Views ---

    function isFinalized(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return _artworks[tokenId].finalized;
    }

    /// @notice Raw image bytes, rebuilt from all chunks.
    function imageData(uint256 tokenId) public view returns (bytes memory image) {
        _requireOwned(tokenId);

        bytes[] storage chunks = _artworks[tokenId].imageChunks;
        for (uint256 i = 0; i < chunks.length; i++) {
            image = bytes.concat(image, chunks[i]);
        }
    }

    /// @notice Image as a `data:<mime>;base64,...` URI, displayable by any browser.
    function imageURI(uint256 tokenId) public view returns (string memory) {
        return string.concat(
            "data:", _artworks[tokenId].mimeType, ";base64,", Base64.encode(imageData(tokenId))
        );
    }

    /// @notice Metadata JSON (same format as the IPFS collection), base64-encoded in a data URI.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        string memory image = imageURI(tokenId); // also reverts for nonexistent tokens
        Artwork storage artwork = _artworks[tokenId];

        string memory json = string.concat(
            '{"name":"', artwork.artworkName,
            '","description":"', artwork.description,
            '","artist":"', artist,
            '","image":"', image,
            '","attributes":[{"trait_type":"Artist","value":"', artist,
            '"},{"trait_type":"Storage","value":"On-chain"},{"trait_type":"Finalized","value":"',
            artwork.finalized ? "Yes" : "No",
            '"}]}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // --- Internal helpers ---

    /// @dev True if `text` contains the characters "42".
    function _contains42(string memory text) private pure returns (bool) {
        bytes memory b = bytes(text);
        for (uint256 i = 0; i + 1 < b.length; i++) {
            if (b[i] == "4" && b[i + 1] == "2") {
                return true;
            }
        }
        return false;
    }

    /// @dev Refuses quotes, backslashes and control characters so user text can be
    ///      inserted in the JSON without escaping and cannot break its structure.
    function _isJsonSafe(string memory text) private pure returns (bool) {
        bytes memory b = bytes(text);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '"' || b[i] == "\\" || uint8(b[i]) < 0x20) {
                return false;
            }
        }
        return true;
    }
}

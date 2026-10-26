const { expect } = require("chai");
const { ethers } = require("hardhat");

const ARTIST = "mokko";
// Test image only: the real artworks live in mint/artworks/
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="60">42</text></svg>';

async function deployFixture() {
  const [owner, alice] = await ethers.getSigners();
  const Inscriptions = await ethers.getContractFactory("Mokko42Inscriptions");
  const nft = await Inscriptions.deploy(ARTIST);
  return { nft, owner, alice };
}

function decodeDataURI(uri, mime) {
  const prefix = `data:${mime};base64,`;
  expect(uri.startsWith(prefix)).to.equal(true);
  return Buffer.from(uri.slice(prefix.length), "base64");
}

describe("Mokko42Inscriptions (on-chain collection)", function () {
  it("exposes ERC-721 metadata and the artist login", async function () {
    const { nft } = await deployFixture();
    expect(await nft.name()).to.equal("MokkoAt42Inscriptions");
    expect(await nft.symbol()).to.equal("M42INS");
    expect(await nft.artist()).to.equal(ARTIST);
    expect(await nft.supportsInterface("0x80ac58cd")).to.equal(true);
  });

  it("stores the image in chunks and rebuilds a valid on-chain tokenURI", async function () {
    const { nft, alice } = await deployFixture();
    const image = Buffer.from(SVG);
    const half = Math.floor(image.length / 2);

    await nft.mint(alice.address, "42 - Test", "On-chain test", "image/svg+xml", image.subarray(0, half));
    await expect(nft.appendImage(1, image.subarray(half)))
      .to.emit(nft, "ImageChunkAppended").withArgs(1n, 1n, BigInt(image.length - half));

    expect(await nft.ownerOf(1)).to.equal(alice.address);
    expect(Buffer.from(ethers.getBytes(await nft.imageData(1))).toString()).to.equal(SVG);

    const metadata = JSON.parse(decodeDataURI(await nft.tokenURI(1), "application/json").toString());
    expect(metadata.name).to.equal("42 - Test");
    expect(metadata.description).to.equal("On-chain test");
    expect(metadata.artist).to.equal(ARTIST);
    expect(metadata.attributes).to.deep.include({ trait_type: "Artist", value: ARTIST });
    expect(metadata.attributes).to.deep.include({ trait_type: "Finalized", value: "No" });
    expect(decodeDataURI(metadata.image, "image/svg+xml").toString()).to.equal(SVG);
  });

  it("encodes base64 correctly for every padding length", async function () {
    const { nft, alice } = await deployFixture();
    for (const size of [1, 2, 3, 4, 5, 255]) {
      const bytes = Buffer.from(Array.from({ length: size }, (_, i) => (i * 37 + size) % 256));
      await nft.mint(alice.address, "42", "", "application/octet-stream", bytes);
      const tokenId = await nft.totalSupply();
      expect(await nft.imageURI(tokenId)).to.equal(`data:application/octet-stream;base64,${bytes.toString("base64")}`);
    }
  });

  it("freezes the artwork after finalize", async function () {
    const { nft, alice } = await deployFixture();
    await nft.mint(alice.address, "42 - Frozen", "", "image/svg+xml", Buffer.from(SVG));

    await expect(nft.finalize(1)).to.emit(nft, "ArtworkFinalized").withArgs(1n);
    expect(await nft.isFinalized(1)).to.equal(true);

    await expect(nft.appendImage(1, "0x42")).to.be.revertedWith("Artwork is finalized");
    await expect(nft.finalize(1)).to.be.revertedWith("Artwork is finalized");

    const metadata = JSON.parse(decodeDataURI(await nft.tokenURI(1), "application/json").toString());
    expect(metadata.attributes).to.deep.include({ trait_type: "Finalized", value: "Yes" });
  });

  it("restricts mint, appendImage and finalize to the owner", async function () {
    const { nft, alice } = await deployFixture();
    const notOwner = (call) => expect(call).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount").withArgs(alice.address);

    await notOwner(nft.connect(alice).mint(alice.address, "42", "", "image/svg+xml", "0x42"));
    await nft.mint(alice.address, "42", "", "image/svg+xml", "0x42");

    // Even the token holder cannot change the artwork
    await notOwner(nft.connect(alice).appendImage(1, "0x42"));
    await notOwner(nft.connect(alice).finalize(1));
  });

  it("validates the name, mime type, image and JSON-unsafe characters", async function () {
    const { nft, alice } = await deployFixture();
    await expect(nft.mint(alice.address, "No number", "", "image/svg+xml", "0x42")).to.be.revertedWith("Name must contain 42");
    await expect(nft.mint(alice.address, "4 2", "", "image/svg+xml", "0x42")).to.be.revertedWith("Name must contain 42");
    await expect(nft.mint(alice.address, "42", "", "", "0x42")).to.be.revertedWith("Mime type required");
    await expect(nft.mint(alice.address, "42", "", "image/svg+xml", "0x")).to.be.revertedWith("Empty image chunk");
    await expect(nft.mint(alice.address, '42 "quoted"', "", "image/svg+xml", "0x42")).to.be.revertedWith("Text has forbidden characters");
    await expect(nft.mint(alice.address, "42", "line\nbreak", "image/svg+xml", "0x42")).to.be.revertedWith("Text has forbidden characters");
  });

  it("reverts on nonexistent tokens", async function () {
    const { nft } = await deployFixture();
    await expect(nft.tokenURI(1)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken").withArgs(1n);
    await expect(nft.appendImage(1, "0x42")).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken").withArgs(1n);
  });
});

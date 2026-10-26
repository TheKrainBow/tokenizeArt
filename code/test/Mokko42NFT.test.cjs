const { expect } = require("chai");
const { ethers } = require("hardhat");

const ARTIST = "mokko";
const METADATA_URI = "ipfs://bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";

async function deployFixture() {
  const [owner, alice, bob] = await ethers.getSigners();
  const Mokko42NFT = await ethers.getContractFactory("Mokko42NFT");
  const nft = await Mokko42NFT.deploy(ARTIST);
  return { nft, owner, alice, bob };
}

describe("Mokko42NFT (IPFS collection)", function () {
  it("exposes ERC-721 metadata and the artist login", async function () {
    const { nft, owner } = await deployFixture();
    expect(await nft.name()).to.equal("MokkoAt42Art");
    expect(await nft.symbol()).to.equal("M42ART");
    expect(await nft.artist()).to.equal(ARTIST);
    expect(await nft.owner()).to.equal(owner.address);
    expect(await nft.totalSupply()).to.equal(0n);
  });

  it("supports ERC-165, ERC-721 and ERC-721 Metadata interfaces", async function () {
    const { nft } = await deployFixture();
    expect(await nft.supportsInterface("0x01ffc9a7")).to.equal(true);
    expect(await nft.supportsInterface("0x80ac58cd")).to.equal(true);
    expect(await nft.supportsInterface("0x5b5e139f")).to.equal(true);
    expect(await nft.supportsInterface("0x49064906")).to.equal(true); // ERC-4906 (from ERC721URIStorage)
    expect(await nft.supportsInterface("0xffffffff")).to.equal(false);
  });

  it("lets the owner mint and confirms ownership with ownerOf", async function () {
    const { nft, alice } = await deployFixture();
    await expect(nft.mint(alice.address, METADATA_URI))
      .to.emit(nft, "Transfer").withArgs(ethers.ZeroAddress, alice.address, 1n)
      .and.to.emit(nft, "Minted").withArgs(1n, alice.address, METADATA_URI);

    expect(await nft.ownerOf(1)).to.equal(alice.address);
    expect(await nft.balanceOf(alice.address)).to.equal(1n);
    expect(await nft.tokenURI(1)).to.equal(METADATA_URI);
    expect(await nft.totalSupply()).to.equal(1n);
  });

  it("refuses mint from a non-owner", async function () {
    const { nft, alice } = await deployFixture();
    await expect(nft.connect(alice).mint(alice.address, METADATA_URI))
      .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount").withArgs(alice.address);
  });

  it("refuses empty metadata and mint to the zero address", async function () {
    const { nft, alice } = await deployFixture();
    await expect(nft.mint(alice.address, "")).to.be.revertedWith("Empty metadata URI");
    await expect(nft.mint(ethers.ZeroAddress, METADATA_URI))
      .to.be.revertedWithCustomError(nft, "ERC721InvalidReceiver").withArgs(ethers.ZeroAddress);
  });

  it("reverts for nonexistent tokens", async function () {
    const { nft } = await deployFixture();
    await expect(nft.ownerOf(1)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken").withArgs(1n);
    await expect(nft.tokenURI(1)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken").withArgs(1n);
  });

  it("lets only the token owner transfer it", async function () {
    const { nft, owner, alice, bob } = await deployFixture();
    await nft.mint(alice.address, METADATA_URI);

    // The contract owner has no right on a token it does not hold
    await expect(nft.connect(owner).transferFrom(alice.address, bob.address, 1))
      .to.be.revertedWithCustomError(nft, "ERC721InsufficientApproval").withArgs(owner.address, 1n);

    await expect(nft.connect(alice).transferFrom(alice.address, bob.address, 1))
      .to.emit(nft, "Transfer").withArgs(alice.address, bob.address, 1n);
    expect(await nft.ownerOf(1)).to.equal(bob.address);
    expect(await nft.balanceOf(alice.address)).to.equal(0n);
    expect(await nft.balanceOf(bob.address)).to.equal(1n);
  });

  it("handles single-token approvals and clears them on transfer", async function () {
    const { nft, alice, bob } = await deployFixture();
    await nft.mint(alice.address, METADATA_URI);

    await expect(nft.connect(bob).approve(bob.address, 1))
      .to.be.revertedWithCustomError(nft, "ERC721InvalidApprover").withArgs(bob.address);

    await nft.connect(alice).approve(bob.address, 1);
    expect(await nft.getApproved(1)).to.equal(bob.address);

    await nft.connect(bob).transferFrom(alice.address, bob.address, 1);
    expect(await nft.ownerOf(1)).to.equal(bob.address);
    expect(await nft.getApproved(1)).to.equal(ethers.ZeroAddress);
  });

  it("handles operator approvals", async function () {
    const { nft, alice, bob } = await deployFixture();
    await nft.mint(alice.address, METADATA_URI);

    await expect(nft.connect(alice).setApprovalForAll(bob.address, true))
      .to.emit(nft, "ApprovalForAll").withArgs(alice.address, bob.address, true);
    expect(await nft.isApprovedForAll(alice.address, bob.address)).to.equal(true);

    await nft.connect(bob).transferFrom(alice.address, bob.address, 1);
    expect(await nft.ownerOf(1)).to.equal(bob.address);

    await expect(nft.connect(alice).setApprovalForAll(ethers.ZeroAddress, true))
      .to.be.revertedWithCustomError(nft, "ERC721InvalidOperator").withArgs(ethers.ZeroAddress);
  });

  it("refuses transfers from a wrong owner or to the zero address", async function () {
    const { nft, alice, bob } = await deployFixture();
    await nft.mint(alice.address, METADATA_URI);

    await expect(nft.connect(alice).transferFrom(bob.address, alice.address, 1))
      .to.be.revertedWithCustomError(nft, "ERC721IncorrectOwner").withArgs(bob.address, 1n, alice.address);
    await expect(nft.connect(alice).transferFrom(alice.address, ethers.ZeroAddress, 1))
      .to.be.revertedWithCustomError(nft, "ERC721InvalidReceiver").withArgs(ethers.ZeroAddress);
  });

  it("safeTransferFrom works for wallets and refuses contracts that cannot receive NFTs", async function () {
    const { nft, alice, bob } = await deployFixture();
    await nft.mint(alice.address, METADATA_URI);

    await nft.connect(alice)["safeTransferFrom(address,address,uint256)"](alice.address, bob.address, 1);
    expect(await nft.ownerOf(1)).to.equal(bob.address);

    // The NFT contract itself does not implement onERC721Received
    await expect(
      nft.connect(bob)["safeTransferFrom(address,address,uint256)"](bob.address, await nft.getAddress(), 1)
    ).to.be.revertedWithCustomError(nft, "ERC721InvalidReceiver").withArgs(await nft.getAddress());
  });

  it("lets the owner hand over the minting privilege", async function () {
    const { nft, owner, alice } = await deployFixture();
    await expect(nft.transferOwnership(alice.address))
      .to.emit(nft, "OwnershipTransferred").withArgs(owner.address, alice.address);

    await expect(nft.mint(owner.address, METADATA_URI))
      .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount").withArgs(owner.address);
    await nft.connect(alice).mint(alice.address, METADATA_URI);
    expect(await nft.ownerOf(1)).to.equal(alice.address);

    await expect(nft.connect(alice).transferOwnership(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(nft, "OwnableInvalidOwner").withArgs(ethers.ZeroAddress);
  });
});

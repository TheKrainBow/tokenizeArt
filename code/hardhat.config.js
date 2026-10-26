require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun", // OpenZeppelin 5.7 uses mcopy; Sepolia and mainnet support Cancun
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};

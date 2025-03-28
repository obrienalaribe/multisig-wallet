import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
const { vars } = require("hardhat/config");
import "@nomicfoundation/hardhat-ethers";

import "./tasks/multisig";
import "./tasks/pending-tx.ts"

const SEPOLIA_PRIVATE_KEY = vars.get("SEPOLIA_PRIVATE_KEY");

const config: HardhatUserConfig = {
  solidity: "0.8.28",

  networks: {
    sepolia: {
      url: `https://sepolia.gateway.tenderly.co`,
      accounts: [SEPOLIA_PRIVATE_KEY],
    },
  }
};

export default config;


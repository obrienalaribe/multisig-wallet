import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
const { vars } = require("hardhat/config");
import "dotenv/config"; // Import and configure dotenv


const msWalletModule = buildModule("MultiSigWalletModule", (m) => {

  console.log("Starting MultiSigWallet deployment...");

  // Set up initial signers
  let signers: any[] = [];

  if (process.env.INITIAL_SIGNERS) {
    signers = process.env.INITIAL_SIGNERS.split(',');
    console.log("Using environment-defined signers");
  } else {
    // Use test signer if not specified
    signers =  [m.getAccount(0), m.getAccount(1), m.getAccount(2)];
  }

    // Set threshold (default to majority)
    const threshold = process.env.THRESHOLD 
    ? parseInt(process.env.THRESHOLD) 
    : Math.ceil(signers.length / 2);
 
  console.log("SIGNERS set to: ", signers);
  console.log(`THRESHOLD: ${threshold} of ${signers.length}`);

  const msWallet = m.contract("MultiSigWallet", [signers, threshold]);

  const ONE_ETH = 10_000_000_000_000_000_000n

  m.send("Send_ETH_To_Deployed_Contract", msWallet, ONE_ETH);
  
  return { msWallet };
});

export default msWalletModule;

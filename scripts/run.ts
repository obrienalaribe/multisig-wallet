import { ethers } from "hardhat";
import { Contract } from "ethers";
import fs from "fs";
import path from "path";
import chalk from "chalk";

/**
 * A simplified script for interacting with a MultiSigWallet contract
 * using on-chain data for transaction management.
 */
async function main(): Promise<void> {
  try {
    console.log(chalk.blue("MultiSigWallet Interaction Script"));
    
    // Get contract address and instance
    const walletAddress = await getWalletAddress();
    console.log(chalk.cyan(`Contract address: ${walletAddress}`));
    
    const walletArtifact = getWalletArtifact();
    const wallet = new Contract(
      walletAddress,
      walletArtifact.abi,
      (await ethers.getSigners())[0]
    );
    
    // Display basic wallet info
    const signers = await wallet.getSigners();
    const threshold = await wallet.threshold();
    console.log(chalk.blue("\n=== Wallet Information ==="));
    console.log(chalk.cyan(`Signers: ${signers.length}`));
    console.log(chalk.cyan(`Threshold: ${threshold}`));
    console.log(chalk.cyan(`Required signatures: ${threshold} of ${signers.length}`));

    // Get pending transactions
    const pendingTxIds = await wallet.getPendingTransactions();
    const pendingTxs = pendingTxIds.map((id: any) => Number(id));
    console.log(chalk.blue("\n=== Pending Transactions ==="));
    console.log(chalk.cyan(`${pendingTxs.length > 0 ? pendingTxs.join(", ") : "None"}`));
    
    // Submit a new transaction
    console.log(chalk.blue("\n=== Submitting New Transaction ==="));
    const txTo = walletAddress;
    const txValue = ethers.parseEther("0.001");
    const txData = "0x";
    const txType = 0;
    
    const submitTx = await wallet.submitTransaction(txTo, txValue, txData, txType);
    const submitReceipt = await submitTx.wait();
    console.log(chalk.green(`Transaction submitted: ${submitReceipt.hash}`));
    
    // Get the new transaction ID
    const txCount = await wallet.transactionId();
    const newTxId = typeof txCount === 'bigint' 
      ? Number(txCount) - 1 
      : (typeof txCount.toNumber === 'function' 
        ? txCount.toNumber() - 1 
        : Number(txCount) - 1);
    console.log(chalk.cyan(`New transaction ID: ${newTxId}`));
    
    // Confirm the transaction using all signers
    console.log(chalk.blue("\n=== Confirming Transaction ==="));
    
    // For each signer
    const allSigners = await ethers.getSigners();
    
    // Safely convert threshold to number
    const thresholdNum = typeof threshold === 'bigint' 
      ? Number(threshold) 
      : (typeof threshold.toNumber === 'function' 
          ? threshold.toNumber() 
          : Number(threshold));
    
    for (let i = 0; i < Math.min(thresholdNum, allSigners.length); i++) {
      const signer = allSigners[i];
      
      try {
        // Get the hash directly from the contract's calculateHash method
        const txHash = await wallet.calculateHash(newTxId);
        console.log(chalk.cyan(`Transaction hash from contract: ${txHash}`));
        
        // Get transaction details
        const tx = await wallet.transactions(newTxId);
        
        // Set up EIP-712 domain and types
        const network = await ethers.provider.getNetwork();
        const domain = {
          name: "MultiSigWallet",
          version: "1.0",
          chainId: network.chainId,
          verifyingContract: walletAddress,
        };
        
        const types = {
          Transaction: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
            { name: "nonce", type: "uint256" },
            { name: "txType", type: "uint8" },
          ],
        };
        
        // Create transaction object for typed data signing
        const transaction = {
          to: tx.to,
          value: tx.value,
          data: tx.data,
          nonce: typeof tx.nonce !== 'undefined' ? tx.nonce : 0,
          txType: typeof tx.txType !== 'undefined' ? tx.txType : 0,
        };
        
        // Generate signature using signTypedData
        const signature = await signer.signTypedData(domain, types, transaction);
        console.log(chalk.cyan(`\nSignature by ${signer.address}: ${signature}`));
        
        // Confirm the transaction
        const confirmTx = await wallet.connect(signer).confirmTransaction(newTxId, signature, txHash);
        const receipt = await confirmTx.wait();
        console.log(chalk.green(`Transaction confirmed by ${signer.address}: ${receipt.hash}`));
  
      } catch (error) {
        console.log(chalk.red(`Failed to confirm with ${signer.address}: ${error.message}`));
      }
    }
    
    // Final transaction state
    try {     
        console.log(chalk.blue("\n=== Final Transaction State ==="));
        
        // Define state and type mappings
        const TxStateMap = {
            0: "Pending",
            1: "Executed",
            2: "Failed",
            3: "Cancelled"
        };
        
        const TxTypeMap= {
            0: "Normal",
            1: "AddSigner",
            2: "RemoveSigner"
        };
  
        // Get transaction details
        const executedTx = await wallet.transactions(newTxId);
        
        // Convert numeric state to string representation
        const stateString = TxStateMap[Number(executedTx.state)] || `Unknown(${executedTx.state})`;
        const txTypeString = TxTypeMap[Number(executedTx.txType)] || `Unknown(${executedTx.txType})`;

        // Check if transaction is no longer pending
        const stillPending = (await wallet.getPendingTransactions()).map(Number).includes(newTxId);
        if (!stillPending) {
            console.log(chalk.cyan(`Transaction ${newTxId} is no longer pending - it is in state: ${stateString}`));
        }

        // Display transaction details
        console.log(chalk.cyan(`To: ${executedTx.to}`));
        console.log(chalk.cyan(`Value: ${ethers.formatEther(executedTx.value)} ETH`));
        console.log(chalk.cyan(`Data: ${executedTx.data}`));
        console.log(chalk.cyan(`Type: ${txTypeString}`));
        console.log(chalk.cyan(`State: ${stateString}`));
        console.log(chalk.cyan(`Confirmations: ${Number(executedTx.confirmations)}`));
    } catch (error) {
      console.log(chalk.red(`Error getting final transaction state: ${error.message}`));
    }
    
    console.log(chalk.blue("\nMultiSigWallet interaction completed."));
    
  } catch (error) {
    console.error(chalk.red("Script execution failed:"));
    console.error(chalk.red(error.message));
    if (error.stack) {
      console.error(chalk.red(error.stack));
    }
    process.exit(1);
  }
}

// Helper function to get wallet address from deployment files
async function getWalletAddress(): Promise<string> {
  const deploymentsDir = path.join(__dirname, "../ignition/deployments");
  const chains = fs.readdirSync(deploymentsDir).filter(file =>
    file.startsWith("chain-") && fs.statSync(path.join(deploymentsDir, file)).isDirectory()
  );

  if (chains.length === 0) {
    throw new Error("No deployments found");
  }

  const latestChain = chains.sort().pop()!;
  const chainDir = path.join(deploymentsDir, latestChain);
  const addressesPath = path.join(chainDir, "deployed_addresses.json");

  if (!fs.existsSync(addressesPath)) {
    throw new Error(`Deployed addresses not found at ${addressesPath}`);
  }

  const deployedAddresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
  const multiSigWalletKey = Object.keys(deployedAddresses).find(key =>
    key.includes("MultiSigWalletModule#MultiSigWallet")
  );

  if (!multiSigWalletKey) {
    throw new Error("MultiSigWallet address not found in deployed addresses");
  }

  return deployedAddresses[multiSigWalletKey];
}

// Helper function to get wallet artifact
function getWalletArtifact(): any {
  const artifactsDir = path.join(__dirname, "../artifacts/contracts");
  const multiSigArtifactPath = path.join(artifactsDir, "MultiSigWallet.sol/MultiSigWallet.json");

  if (!fs.existsSync(multiSigArtifactPath)) {
    throw new Error(`MultiSigWallet artifact not found at ${multiSigArtifactPath}`);
  }

  return JSON.parse(fs.readFileSync(multiSigArtifactPath, "utf8"));
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(chalk.red(error));
    process.exit(1);
  });


// tasks/multisig.ts
import { task, types } from "hardhat/config";
import chalk from "chalk";
import {
  setupWallet,
  getWalletAddress,
  getWalletArtifact,
  displayTransactionDetails,
  getTransactionTypeString, // Import the helper function
  getTransactionStateString, // Import the helper function
} from "./helpers";

// Helper function to get the MultiSigWallet contract instance
async function getMultiSigWalletContract(address: string, hre: any) {
  const artifact = getWalletArtifact();
  return new hre.ethers.Contract(address, artifact.abi, (await hre.ethers.getSigners())[0]);
}

// Task to submit a new transaction
task("multisig:submit", "Submits a new transaction to the MultiSigWallet")
  .addParam("value", "Amount of ETH to send", "0", types.string)
  .addParam("data", "Transaction data (hex)", "0x", types.string)
  .addOptionalParam("type", "Transaction type (0=Normal, 1=AddSigner, 2=RemoveSigner)", 0, types.int)
  .setAction(async (args, hre) => {
    try {
      const walletAddress = await getWalletAddress();
      const wallet = await getMultiSigWalletContract(walletAddress, hre);

      console.log(chalk.blue("=== Submitting New Transaction ==="));
      console.log(chalk.cyan(`To: ${walletAddress}`)); // Displaying the contract address
      console.log(chalk.cyan(`Value: ${args.value} ETH`));
      console.log(chalk.cyan(`Data: ${args.data}`));
      console.log(chalk.cyan(`Type: ${getTransactionTypeString(args.type)}`));

      const value = hre.ethers.parseEther(args.value.toString());
      const signer = (await hre.ethers.getSigners())[0];

      console.log(chalk.cyan(`Account: ${signer.address}`));
      const tx = await wallet.submitTransaction(walletAddress, value, args.data, args.type); 
      const receipt = await tx.wait();

      
      const txId = Number(await wallet.transactionId()) - 1;
      console.log(chalk.green(`Transaction submitted with ID ${txId}: ${receipt.hash}`));
    } catch (error: any) {
        
      console.log(chalk.red(`Error submitting transaction: ${error.message}`));
    }
  });
// Task to confirm a transaction
task("multisig:confirm", "Confirms a pending transaction")
  .addParam("id", "Transaction ID to confirm", undefined, types.int)
  .addOptionalParam("signer", "Address of the signer to impersonate", undefined, types.string)
  .setAction(async (args, hre) => {
    try {
      const walletAddress = await getWalletAddress();
      const wallet = await getMultiSigWalletContract(walletAddress, hre);

      console.log(chalk.blue(`=== Confirming Transaction #${args.id} ===`));

      const txHash = await wallet.calculateHash(args.id);
      console.log(chalk.cyan(`Transaction hash from contract: ${txHash}`));

      const tx = await wallet.transactions(args.id);

      // Get and display signers
      const contractSigners = await wallet.getSigners();
      console.log(chalk.cyan("\nSigner must be in Signers Set below:"));
      contractSigners.forEach((signerAddress, index) => {
        console.log(chalk.cyan(`${index + 1}. ${signerAddress}`));
      });

      // Get threshold
      const threshold = await wallet.threshold();
      
      // Get current confirmations
      const currentConfirmations = tx.confirmations;
      console.log(chalk.cyan(`\nCurrent Confirmations: ${currentConfirmations}`));
      
      const remainingConfirmations = threshold - currentConfirmations;
      console.log(chalk.cyan(`Remaining Confirmations: ${remainingConfirmations}`));
      console.log(chalk.cyan(`Required Confirmations: ${threshold.toString()} / ${contractSigners.length}`));
      
      // Set up EIP-712 domain and types
        const network = await hre.ethers.provider.getNetwork();
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
        
      let signer;
      if (args.signer) {
        // Impersonate the specified signer
        signer = await ethers.getImpersonatedSigner(args.signer);
        console.log(chalk.cyan(`\nImpersonating signer: ${args.signer}`));
      } else {
        // Use the default signer
        signer = (await hre.ethers.getSigners())[0];
        console.log(chalk.cyan(`Using default signer: ${signer.address}`));
      }

      // Sign the txHash directly
      const signature = await signer.signTypedData(domain, types, transaction);
      console.log(chalk.cyan(`Signature: ${signature}`));

      const confirmTx = await wallet.connect(signer).confirmTransaction(args.id, signature, txHash);
      const receipt = await confirmTx.wait();
      console.log(chalk.green(`Transaction confirmed: ${receipt.hash}`));


      // Listen for TransactionConfirmed event

    //  Display tx
      await displayTransactionDetails(wallet, args.id, hre);

    } catch (error: any) {
      console.log(chalk.red(`Error confirming transaction: ${error.message}`));
    }
  });

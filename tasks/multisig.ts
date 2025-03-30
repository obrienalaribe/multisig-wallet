// tasks/multisig.ts
import { task, types } from "hardhat/config";
import chalk from "chalk";
import {
  setupWallet,
  getWalletAddress,
  getWalletArtifact,
  displayTransactionDetails,
} from "./helpers";

// Helper function to get the MultiSigWallet contract instance
async function getMultiSigWalletContract(address: string, hre: any) {
  const artifact = getWalletArtifact();
  return new hre.ethers.Contract(address, artifact.abi, (await hre.ethers.getSigners())[0]);
}

task("balance", "Prints an account's balance")
  .addParam("account", "The account's address")
  .setAction(async (args,hre) => {
    const balance = await hre.ethers.provider.getBalance(args.account);

    console.log(hre.ethers.formatEther(balance), "ETH");
});
 
task("multisig:signers", "Gets all signers for the multisig")
    .setAction(async (parseArgs,hre) => {
        const walletAddress = await getWalletAddress();
        const wallet = await getMultiSigWalletContract(walletAddress, hre);
      const contractSigners = await wallet.getSigners();
      console.log(chalk.cyan("\nSigner Set:"));
      contractSigners.forEach((signerAddress, index) => {
        console.log(chalk.cyan(`${index + 1}. ${signerAddress}`));
      });
        
      // Get threshold  
      const threshold = await wallet.threshold();
    
      console.log(chalk.cyan(`Required Confirmations: ${threshold.toString()} / ${contractSigners.length}`));

});

task("multisig:addSigner", "Submits a transaction to add a new signer to the MultiSigWallet")
  .addParam("address", "Address of the new signer to add", undefined, types.string)
  .setAction(async (args, hre) => {
    try {
      const walletAddress = await getWalletAddress();
      const wallet = await getMultiSigWalletContract(walletAddress, hre);
      const signer = (await hre.ethers.getSigners())[0];
      
      console.log(chalk.blue("=== Submitting Add Signer Transaction ==="));
      console.log(chalk.cyan(`MultiSig Contract: ${walletAddress}`));
      console.log(chalk.cyan(`New Signer: ${args.address}`));
      console.log(chalk.cyan(`Submitter: ${signer.address}`));
      
      // Encode the address parameter for the AddSigner transaction
      const abiCoder = hre.ethers.AbiCoder.defaultAbiCoder();
      const data = abiCoder.encode(['address'], [args.address]);
      
      // Submit the transaction with zero value, the encoded address as data, and type=1 (AddSigner)
      const tx = await wallet.submitTransaction(
        walletAddress, 
        0,             
        data,
        1
      );
      
      const receipt = await tx.wait();
      
      // Get current transaction ID (the one we just submitted will be this - 1)
      const txId = await wallet.transactionId();
      console.log(chalk.green(`Transaction submitted with ID ${Number(txId) - 1}: ${receipt.hash}`));
      console.log(chalk.yellow(`Note: This transaction still needs to be confirmed by ${await wallet.threshold()} signers before it's executed.`));
      
    } catch (error) {
      console.log(chalk.red(`Error submitting transaction: ${error.message}`));
    }
  });


  task("multisig:removeSigner", "Submits a transaction to remove a signer from the MultiSigWallet")
  .addParam("address", "Address of the signer to remove", undefined, types.string)
  .setAction(async (args, hre) => {
    try {
      const walletAddress = await getWalletAddress();
      const wallet = await getMultiSigWalletContract(walletAddress, hre);
      const signer = (await hre.ethers.getSigners())[0];
      
      console.log(chalk.blue("=== Submitting Remove Signer Transaction ==="));
      console.log(chalk.cyan(`MultiSig Contract: ${walletAddress}`));
      console.log(chalk.cyan(`Signer to Remove: ${args.address}`));
      console.log(chalk.cyan(`Submitter: ${signer.address}`));
      
      // Encode the address parameter for the RemoveSigner transaction
      const abiCoder = hre.ethers.AbiCoder.defaultAbiCoder();
      const data = abiCoder.encode(['address'], [args.address]);
      
      // Submit the transaction with zero value, the encoded address as data, and type=2 (RemoveSigner)
      const tx = await wallet.submitTransaction(
        walletAddress, 
        0,             
        data,
        2
      );
      
      const receipt = await tx.wait();
      
      // Get current transaction ID (the one we just submitted will be this - 1)
      const txId = await wallet.transactionId();
      console.log(chalk.green(`Transaction submitted with ID ${Number(txId) - 1}: ${receipt.hash}`));
      console.log(chalk.yellow(`Note: This transaction still needs to be confirmed by ${await wallet.threshold()} signers before it's executed.`));
      
    } catch (error) {
      console.log(chalk.red(`Error submitting transaction: ${error.message}`));
    }
  });

  task("multisig:transfer", "Submits a transaction to transfer ETH")
  .addParam("to", "Recipient address", undefined, types.string)
  .addParam("value", "Amount of ETH to send", undefined, types.string)
  .setAction(async (args, hre) => {
    try {
      const walletAddress = await getWalletAddress();
      const wallet = await getMultiSigWalletContract(walletAddress, hre);
      const signer = (await hre.ethers.getSigners())[0];
      
      console.log(chalk.blue("=== Submitting ETH Transfer Transaction ==="));
      console.log(chalk.cyan(`From MultiSig: ${walletAddress}`));
      console.log(chalk.cyan(`To Recipient: ${args.to}`));
      console.log(chalk.cyan(`Value: ${args.value} ETH`));
      console.log(chalk.cyan(`Submitter: ${signer.address}`));
      
      // Convert ETH value to wei
      const value = hre.ethers.parseEther(args.value);
      
      // Transaction type 0 = Normal transfer
      const tx = await wallet.submitTransaction(
        args.to,  // The recipient address
        value,    // Amount of ETH to send
        "0x",     // Empty data for simple transfer
        0         // Transaction type 0 (Normal)
      );
      
      const receipt = await tx.wait();
      
      // Get current transaction ID
      const txId = await wallet.transactionId();
      console.log(chalk.green(`Transaction submitted with ID ${Number(txId) - 1}: ${receipt.hash}`));
      console.log(chalk.yellow(`Note: This transaction still needs to be confirmed by ${await wallet.threshold()} signers before it's executed.`));
      
    } catch (error) {
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

  task("multisig:cancelTransaction", "Cancels a pending transaction in the MultiSigWallet")
  .addParam("id", "ID of the transaction to cancel", undefined, types.int)
  .setAction(async (args, hre) => {
    try {
      const walletAddress = await getWalletAddress();
      const wallet = await getMultiSigWalletContract(walletAddress, hre);
      const signer = (await hre.ethers.getSigners())[0];
      
      console.log(chalk.blue("=== Cancelling Transaction ==="));
      console.log(chalk.cyan(`MultiSig Contract: ${walletAddress}`));
      console.log(chalk.cyan(`Transaction ID: ${args.id}`));
      console.log(chalk.cyan(`Canceller: ${signer.address}`));
      
      // Verify the transaction exists and is pending
      try {
        const transaction = await wallet.transactions(args.id);
        console.log(chalk.cyan(`Transaction state: ${transaction.state}`));
        
        // Check if transaction is pending (state = 0)
        if (transaction.state != 0) {
          console.log(chalk.red(`Transaction ${args.id} is not in pending state and cannot be cancelled.`));
          return;
        }
        
        // Verify the signer status
        const isSigner = await wallet.isSigner(signer.address);
        if (!isSigner) {
          console.log(chalk.red(`Address ${signer.address} is not a signer and cannot cancel transactions.`));
          return;
        }
        
        // Cancel the transaction
        console.log(chalk.yellow("Submitting cancellation..."));
        const tx = await wallet.cancelTransaction(args.id);
        
        const receipt = await tx.wait();
        
        console.log(chalk.green(`Transaction ${args.id} cancelled successfully`));
        console.log(chalk.green(`Transaction hash: ${receipt.hash}`));
        
      } catch (error) {
        console.log(chalk.red(`Error verifying transaction: ${error.message}`));
        return;
      }
      
    } catch (error) {
      console.log(chalk.red(`Error cancelling transaction: ${error.message}`));
    }
  });

task("multisig:pending", "Lists all pending transactions in the MultiSigWallet")
.setAction(async (_, hre) => {
  try {
    const walletAddress = await getWalletAddress();
    console.log(chalk.cyan(`Contract address: ${walletAddress}`));

    const walletArtifact = getWalletArtifact();
    const wallet = new hre.ethers.Contract(
      walletAddress,
      walletArtifact.abi,
      (await hre.ethers.getSigners())[0]
    );

    console.log(chalk.blue("=== Pending Transactions ==="));

    let pendingTxs;
    try {
      pendingTxs = await wallet.getPendingTransactions();
    } catch (error: any) {
        console.log(chalk.red(`Error retrieving pending transactions: ${error.message}`));
        return;
      
    }

    if (!pendingTxs || pendingTxs.length === 0) {
      console.log(chalk.cyan("No pending transactions"));
      return;
    }

    const txIds = pendingTxs.map((id) => Number(id));
    console.log(chalk.cyan(`Pending transaction IDs: ${txIds.join(", ")}`));

    for (const txId of txIds) {
      await displayTransactionDetails(wallet, txId, hre);
    }
  } catch (setupError) {
    console.log(chalk.red(`Error: ${setupError.message}`));
  }
});
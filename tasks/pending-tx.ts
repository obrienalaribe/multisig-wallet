// tasks/pending-tx.tsimport { task } from "hardhat/config";
import chalk from "chalk";
import { getWalletAddress, getWalletArtifact, displayTransactionDetails } from "./helpers";

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
        if (error.message.includes("could not decode result data") && error.value === "0x") {
          console.log(chalk.cyan("No pending transactions"));
          return;
        } else {
          console.log(chalk.red(`Error retrieving pending transactions: ${error.message}`));
          return;
        }
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
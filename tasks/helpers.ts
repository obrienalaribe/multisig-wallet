// tasks/multisig-helpers.ts
import { Contract, ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Constants for transaction states and types
const TRANSACTION_STATES: Record<number, string> = {
  0: "Pending",
  1: "Executed",
  2: "Failed",
  3: "Cancelled",
};

const TRANSACTION_TYPES: Record<number, string> = {
  0: "Normal",
  1: "AddSigner",
  2: "RemoveSigner",
};

// Helper to get wallet address from deployment files
export async function getWalletAddress(): Promise<string> {
  const deploymentsDir = path.join(__dirname, "../ignition/deployments");
  const chains = fs.readdirSync(deploymentsDir).filter((file) =>
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
  const multiSigWalletKey = Object.keys(deployedAddresses).find((key) =>
    key.includes("MultiSigWalletModule#MultiSigWallet")
  );

  if (!multiSigWalletKey) {
    throw new Error("MultiSigWallet address not found in deployed addresses");
  }

  return deployedAddresses[multiSigWalletKey];
}

// Helper to get wallet artifact
export function getWalletArtifact(): any {
  const artifactsDir = path.join(__dirname, "../artifacts/contracts");
  const multiSigArtifactPath = path.join(artifactsDir, "MultiSigWallet.sol/MultiSigWallet.json");

  if (!fs.existsSync(multiSigArtifactPath)) {
    throw new Error(`MultiSigWallet artifact not found at ${multiSigArtifactPath}`);
  }

  return JSON.parse(fs.readFileSync(multiSigArtifactPath, "utf8"));
}

// Setup wallet connection
export async function setupWallet(hre: any): Promise<{ wallet: Contract; walletAddress: string }> {
  const walletAddress = await getWalletAddress();
  const walletArtifact = getWalletArtifact();
  const wallet = new hre.ethers.Contract(
    walletAddress,
    walletArtifact.abi,
    (await hre.ethers.getSigners())[0]
  );

  return { wallet, walletAddress };
}

// Helper to display transaction details
export async function displayTransactionDetails(wallet: Contract, txId: number, hre: any): Promise<void> {
  try {
    const tx = await wallet.transactions(txId);

    console.log(`\nTransaction #${txId}:`);
    console.log(`To: ${tx.to}`);
    console.log(`Value: ${hre.ethers.formatEther(tx.value)} ETH`);
    console.log(`Data: ${tx.data}`);
    console.log(`Nonce: ${tx.nonce}`);
    console.log(`Type: ${getTransactionTypeString(tx.txType)}`);
    console.log(`State: ${getTransactionStateString(tx.state)}`);
    console.log(`Confirmations: ${tx.confirmations}`);
  } catch (txError: any) {
    console.log(`Error retrieving transaction #${txId}: ${txError.message}`);
  }
}

// Helper to convert transaction state to string
export function getTransactionStateString(state: number | bigint): string {
  return TRANSACTION_STATES[Number(state)] || `Unknown(${state})`;
}

// Helper to convert transaction type to string
export function getTransactionTypeString(type: number | bigint): string {
  return TRANSACTION_TYPES[Number(type)] || `Unknown(${type})`;
}
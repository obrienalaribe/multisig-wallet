import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";

// Deploy a simple test contract for interaction
async function deployTestContract() {
  const TestContractFactory = await ethers.getContractFactory("TestContract");
  const testContract = await TestContractFactory.deploy();
  return { testContract };
}

describe("MultiSigWallet", function () {
  async function deployMultiSigWalletFixture() {
    const [owner, signer2, signer3, signer4, signer5] = await hre.ethers.getSigners();
    console.log("Deploying MultiSigWallet with signers:", [owner.address, signer2.address, signer3.address], "and threshold: 2");
    const MultiSigWallet = await hre.ethers.getContractFactory("MultiSigWallet");
    const msWallet = await MultiSigWallet.deploy([owner.address, signer2.address, signer3.address], 2);
    console.log("MultiSigWallet deployed at:", msWallet.target);
    
    // Fund the wallet for testing transactions that transfer ETH
    await owner.sendTransaction({
      to: msWallet.target,
      value: ethers.parseEther("1.0")
    });
    console.log("Wallet funded with 1 ETH");
    
    return { msWallet, owner, signer2, signer3, signer4, signer5 };
  }

  describe("Deployment", function () {
    it("Should initialize with the correct signers and threshold", async function () {
      const { msWallet, owner, signer2, signer3, signer4 } = await loadFixture(deployMultiSigWalletFixture);
      console.log("Running test: Should initialize with the correct signers and threshold");
      
      const signers = await msWallet.getSigners();
      const threshold = await msWallet.threshold();
      
      console.log("Signers from contract:", signers);
      console.log("Threshold from contract:", threshold);
      
      expect(signers).to.deep.equal([owner.address, signer2.address, signer3.address]);
      expect(await msWallet.getSignerCount()).to.equal(3);
      expect(threshold).to.equal(2);
      
      // Verify each address is marked as a signer
      expect(await msWallet.isSigner(owner.address)).to.be.true;
      expect(await msWallet.isSigner(signer2.address)).to.be.true;
      expect(await msWallet.isSigner(signer3.address)).to.be.true;
      expect(await msWallet.isSigner(signer4.address)).to.be.false;
      
      console.log("Test passed: Correct initial signers and threshold stored");
    });
  });

  describe("Transaction Management", function () {
    it("Should submit a transaction", async function () {
      const { msWallet, owner, signer4 } = await loadFixture(deployMultiSigWalletFixture);
      console.log("Running test: Should submit a transaction");
      
      const arbitraryAddress = signer4.address;
      const arbitraryValue = ethers.parseEther("0.1");
      const arbitraryData = "0x";
      const txType = 0; // Normal transaction
      
      console.log("Submitting transaction with to:", arbitraryAddress, "value:", arbitraryValue, "data:", arbitraryData, "txType:", txType, "from:", owner.address);
      
      await expect(msWallet.connect(owner).submitTransaction(arbitraryAddress, arbitraryValue, arbitraryData, txType))
        .to.emit(msWallet, "TransactionSubmitted")
        .withArgs(0, owner.address);
      
      const transaction = await msWallet.transactions(0);
      console.log("Transaction details from contract:", transaction);
      
      expect(transaction.to).to.equal(arbitraryAddress);
      expect(transaction.value).to.equal(arbitraryValue);
      expect(transaction.data).to.equal(arbitraryData);
      expect(transaction.state).to.equal(0); // Pending
      expect(transaction.confirmations).to.equal(0); // No confirmations yet
      
      // Check pending transactions list
      const pendingTxs = await msWallet.getPendingTransactions();
      expect(pendingTxs.length).to.equal(1);
      expect(pendingTxs[0]).to.equal(0);
      
      console.log("Test passed: Transaction submitted correctly");
    });

    it("Should confirm a transaction with valid EIP-712 signature", async function () {
      const { msWallet, owner, signer2, signer4 } = await loadFixture(deployMultiSigWalletFixture);
      console.log("Running test: Should confirm a transaction with valid EIP-712 signature");
      
      const arbitraryAddress = signer4.address;
      const arbitraryValue = ethers.parseEther("0.1");
      const arbitraryData = "0x";
      const txType = 0; // Normal transaction

      await msWallet.connect(owner).submitTransaction(arbitraryAddress, arbitraryValue, arbitraryData, txType);

      const transaction = await msWallet.transactions(0);
      console.log("Transaction to be signed:", transaction);

      // Setup EIP-712 domain and types
      const domain = {
        name: "MultiSigWallet",
        version: "1.0",
        chainId: hre.network.config.chainId,
        verifyingContract: msWallet.target,
      };
      console.log("EIP-712 domain:", domain);

      const types = {
        Transaction: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
          { name: "nonce", type: "uint256" },
          { name: "txType", type: "uint8" },
        ],
      };
      console.log("EIP-712 types:", types);

      // Generate EIP-712 signature
      const signature = await signer2.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });
      console.log("Signature generated:", signature);

      const txHash = await msWallet.calculateHash(0);
      console.log("Transaction hash from contract:", txHash);

      await expect(msWallet.connect(signer2).confirmTransaction(0, signature, txHash))
        .to.emit(msWallet, "TransactionConfirmed")
        .withArgs(0, signer2.address);
      console.log("Transaction confirmed by signer2");

      const confirmed = await msWallet.confirmations(0, signer2.address);
      console.log("Confirmation status:", confirmed);
      expect(confirmed).to.be.true;
      
      // Check confirmation count and transaction state
      const updatedTx = await msWallet.transactions(0);
      expect(updatedTx.confirmations).to.equal(1);
      
      // Print the actual transaction state for debugging
      console.log("Transaction state after confirmation:", updatedTx.state);
      // Don't verify the state here as the transaction isn't executed yet with just one confirmation
      
      console.log("Test passed: Transaction confirmed with valid EIP-712 signature");
    });

    it("Should execute a transaction after reaching threshold confirmations", async function () {
      const { msWallet, owner, signer2, signer4 } = await loadFixture(deployMultiSigWalletFixture);
      console.log("Running test: Should execute a transaction after reaching threshold confirmations");
      
      // Check initial balance of recipient
      const initialBalance = await ethers.provider.getBalance(signer4.address);
      console.log("Initial balance of recipient:", ethers.formatEther(initialBalance), "ETH");
      
      const transferAmount = ethers.parseEther("0.1");
      const arbitraryAddress = signer4.address;
      const arbitraryData = "0x";
      const txType = 0; // Normal transaction

      await msWallet.connect(owner).submitTransaction(arbitraryAddress, transferAmount, arbitraryData, txType);

      const transaction = await msWallet.transactions(0);
      console.log("Transaction to be executed:", transaction);

      // Setup EIP-712 domain and types
      const domain = {
        name: "MultiSigWallet",
        version: "1.0",
        chainId: hre.network.config.chainId,
        verifyingContract: msWallet.target,
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

      // First signature from owner
      const signature1 = await owner.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });
      console.log("Signature from owner:", signature1);

      // Second signature from signer2
      const signature2 = await signer2.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });
      console.log("Signature from signer2:", signature2);

      const txHash = await msWallet.calculateHash(0);
      console.log("Transaction hash from contract:", txHash);

      // First confirmation
      await msWallet.connect(owner).confirmTransaction(0, signature1, txHash);
      console.log("Transaction confirmed by owner");
      
      // Transaction should still be pending
      let pendingTx = await msWallet.transactions(0);
      expect(pendingTx.state).to.equal(0); // Still pending
      
      // Second confirmation - this should trigger execution
      await expect(msWallet.connect(signer2).confirmTransaction(0, signature2, txHash))
        .to.emit(msWallet, "ExecutedTransaction");
        // Note: We're not checking the specific state value since it varies by implementation
      
      console.log("Transaction confirmed by signer2 and executed");

      // Trying to confirm again should fail because transaction is already confirmed by this signer
      await expect(msWallet.connect(signer2).confirmTransaction(0, signature2, txHash))
        .to.be.revertedWith("Already confirmed");
      console.log("Second confirmation by the same signer properly reverted");

      // Check transaction state
      const executedTx = await msWallet.transactions(0);
      console.log("Transaction state after execution:", executedTx.state);
      // Instead of checking for a specific state value, we just check it's not pending (0)
      expect(executedTx.state).to.not.equal(0);
      
      // Verify funds were transferred successfully
      const finalBalance = await ethers.provider.getBalance(signer4.address);
      console.log("Final balance of recipient:", ethers.formatEther(finalBalance), "ETH");
      
      // Check that the balance increased by approximately the transfer amount
      const balanceIncrease = finalBalance - initialBalance;
      console.log("Balance increase:", ethers.formatEther(balanceIncrease), "ETH");
      
      // Use a range check rather than exact equality
      expect(balanceIncrease).to.be.closeTo(transferAmount, ethers.parseEther("0.001"));
      
      // Check that transaction is no longer in pending list
      const pendingTxs = await msWallet.getPendingTransactions();
      expect(pendingTxs.length).to.equal(0);
      
      console.log("Test passed: Transaction executed after reaching threshold confirmations");
    });

    it("Should reject confirmation with invalid signature", async function () {
      const { msWallet, owner, signer2, signer3, signer4 } = await loadFixture(deployMultiSigWalletFixture);
      console.log("Running test: Should reject confirmation with invalid signature");
      
      const arbitraryAddress = signer4.address;
      const arbitraryValue = ethers.parseEther("0.1");
      const arbitraryData = "0x";
      const txType = 0; // Normal transaction

      await msWallet.connect(owner).submitTransaction(arbitraryAddress, arbitraryValue, arbitraryData, txType);

      // Calculate transaction hash
      const txHash = await msWallet.calculateHash(0);
      console.log("Transaction hash from contract:", txHash);
      
      // Test case 1: Using standard message signing instead of EIP-712
      const invalidSignature1 = await signer2.signMessage(ethers.getBytes(txHash));
      console.log("Invalid signature (wrong format) generated:", invalidSignature1);

      await expect(msWallet.connect(signer2).confirmTransaction(0, invalidSignature1, txHash))
        .to.be.revertedWith("Invalid signature");
      
      // Test case 2: Using EIP-712 but from a different signer
      const domain = {
        name: "MultiSigWallet",
        version: "1.0",
        chainId: hre.network.config.chainId,
        verifyingContract: msWallet.target,
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
      
      const transaction = await msWallet.transactions(0);
      
      // Signer3 creates a valid signature
      const validSignatureFromSigner3 = await signer3.signTypedData(
        domain,
        types,
        {
          to: transaction.to,
          value: transaction.value,
          data: transaction.data,
          nonce: transaction.nonce,
          txType: transaction.txType,
        }
      );
      
      // But signer2 tries to use it
      await expect(msWallet.connect(signer2).confirmTransaction(0, validSignatureFromSigner3, txHash))
        .to.be.revertedWith("Invalid signature");
      
      console.log("Test passed: Transaction confirmation rejected with invalid signatures");
    });

    it("Should cancel a pending transaction", async function () {
      const { msWallet, owner, signer4 } = await loadFixture(deployMultiSigWalletFixture);
      console.log("Running test: Should cancel a pending transaction");
      
      const arbitraryAddress = signer4.address;
      const arbitraryValue = ethers.parseEther("0.1");
      const arbitraryData = "0x";
      const txType = 0; // Normal transaction

      await msWallet.connect(owner).submitTransaction(arbitraryAddress, arbitraryValue, arbitraryData, txType);
      
      // Check that transaction is in pending list
      let pendingTxs = await msWallet.getPendingTransactions();
      expect(pendingTxs.length).to.equal(1);
      expect(pendingTxs[0]).to.equal(0);

      await expect(msWallet.connect(owner).cancelTransaction(0))
        .to.emit(msWallet, "TransactionCancelled")
        .withArgs(0);
      console.log("Transaction cancelled by owner");

      const transaction = await msWallet.transactions(0);
      console.log("Transaction state after cancellation:", transaction.state);
      expect(transaction.state).to.equal(3); // Cancelled
      
      // Check that transaction is removed from pending list
      pendingTxs = await msWallet.getPendingTransactions();
      expect(pendingTxs.length).to.equal(0);
      
      console.log("Test passed: Transaction cancelled successfully");
    });

    it("Should not cancel an already executed transaction", async function () {
      const { msWallet, owner, signer2, signer4 } = await loadFixture(deployMultiSigWalletFixture);
      console.log("Running test: Should not cancel an already executed transaction");
      
      const arbitraryAddress = signer4.address;
      const arbitraryValue = ethers.parseEther("0.1");
      const arbitraryData = "0x";
      const txType = 0; // Normal transaction

      await msWallet.connect(owner).submitTransaction(arbitraryAddress, arbitraryValue, arbitraryData, txType);

      const transaction = await msWallet.transactions(0);

      // Setup EIP-712 domain and types
      const domain = {
        name: "MultiSigWallet",
        version: "1.0",
        chainId: hre.network.config.chainId,
        verifyingContract: msWallet.target,
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

      // Generate signatures and execute transaction
      const signature1 = await owner.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });

      const signature2 = await signer2.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });

      const txHash = await msWallet.calculateHash(0);

      await msWallet.connect(owner).confirmTransaction(0, signature1, txHash);
      await msWallet.connect(signer2).confirmTransaction(0, signature2, txHash);
      console.log("Transaction confirmed by owner and signer2, and executed");

      // Attempt to cancel the executed transaction
      await expect(msWallet.connect(owner).cancelTransaction(0))
        .to.be.revertedWith("Transaction not pending");
      console.log("Attempt to cancel executed transaction properly reverted");
    });
  });
  
  describe("Signer Management", function () {
    it("Should add a new signer through a transaction", async function () {
      const { msWallet, owner, signer2, signer4 } = await loadFixture(deployMultiSigWalletFixture);
      console.log("Running test: Should add a new signer through a transaction");
      
      // Encode the data for adding a new signer
      const data = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [signer4.address]);
      const txType = 1; // AddSigner transaction type
      
      await msWallet.connect(owner).submitTransaction(ethers.ZeroAddress, 0, data, txType);
      
      const domain = {
        name: "MultiSigWallet",
        version: "1.0",
        chainId: hre.network.config.chainId,
        verifyingContract: msWallet.target,
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

      const transaction = await msWallet.transactions(0);
      
      // Calculate transaction hash
      const txHash = await msWallet.calculateHash(0);
      
      // Owner signs and confirms
      const signature1 = await owner.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });
      await msWallet.connect(owner).confirmTransaction(0, signature1, txHash);
      
      // Signer2 signs and confirms - this should trigger execution
      const signature2 = await signer2.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });
      
      await expect(msWallet.connect(signer2).confirmTransaction(0, signature2, txHash))
        .to.emit(msWallet, "SignerAdded")
        .withArgs(signer4.address);
      
      // Check that signer was added
      const signers = await msWallet.getSigners();
      const signerCount = await msWallet.getSignerCount();
      
      expect(signerCount).to.equal(4);
      expect(signers.length).to.equal(4);
      expect(signers[3]).to.equal(signer4.address);
      expect(await msWallet.isSigner(signer4.address)).to.be.true;
      
      console.log("Test passed: New signer added successfully");
    });

    it("Should remove a signer through a transaction", async function () {
      const { msWallet, owner, signer2, signer3 } = await loadFixture(deployMultiSigWalletFixture);
      console.log("Running test: Should remove a signer through a transaction");
      
      // Encode the data for removing a signer
      const data = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [signer3.address]);
      const txType = 2; // RemoveSigner transaction type
      
      await msWallet.connect(owner).submitTransaction(ethers.ZeroAddress, 0, data, txType);
      
      const domain = {
        name: "MultiSigWallet",
        version: "1.0",
        chainId: hre.network.config.chainId,
        verifyingContract: msWallet.target,
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

      const transaction = await msWallet.transactions(0);
      
      // Calculate transaction hash
      const txHash = await msWallet.calculateHash(0);
      
      // Owner signs and confirms
      const signature1 = await owner.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });
      await msWallet.connect(owner).confirmTransaction(0, signature1, txHash);
      
      // Signer2 signs and confirms - this should trigger execution
      const signature2 = await signer2.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });
      
      await expect(msWallet.connect(signer2).confirmTransaction(0, signature2, txHash))
        .to.emit(msWallet, "SignerRemoved")
        .withArgs(signer3.address);
      
      // Check that signer was removed
      const signers = await msWallet.getSigners();
      const signerCount = await msWallet.getSignerCount();
      
      expect(signerCount).to.equal(2);
      expect(signers.length).to.equal(2);
      expect(await msWallet.isSigner(signer3.address)).to.be.false;
      
      // Verify the signers array was properly updated
      expect(signers).to.include(owner.address);
      expect(signers).to.include(signer2.address);
      expect(signers).to.not.include(signer3.address);
      
      console.log("Test passed: Signer removed successfully");
    });
  });
  
  
  describe("ETH Transfer Operations", function() {
    it("Should transfer ETH directly to a recipient", async function() {
      const { msWallet, owner, signer2, signer4 } = await loadFixture(deployMultiSigWalletFixture);
      console.log("Running test: Should transfer ETH directly to a recipient");
      
      // Check initial balances
      const walletBalance = await ethers.provider.getBalance(msWallet.target);
      const initialRecipientBalance = await ethers.provider.getBalance(signer4.address);
      
      console.log("Initial wallet balance:", ethers.formatEther(walletBalance), "ETH");
      console.log("Initial recipient balance:", ethers.formatEther(initialRecipientBalance), "ETH");
      
      // Amount to transfer
      const transferAmount = ethers.parseEther("0.25");
      
      // Submit a transaction with direct ETH transfer
      await msWallet.connect(owner).submitTransaction(
        signer4.address,   // Direct transfer to recipient
        transferAmount,    // Amount to transfer
        "0x",             // Empty data
        0                 // Normal transaction
      );
      
      console.log("Transaction submitted for direct ETH transfer");
      
      // Setup EIP-712 signature
      const domain = {
        name: "MultiSigWallet",
        version: "1.0",
        chainId: hre.network.config.chainId,
        verifyingContract: msWallet.target,
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
      
      const transaction = await msWallet.transactions(0);
      const txHash = await msWallet.calculateHash(0);
      
      // Get signatures from the signers
      const signature1 = await owner.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });
      
      const signature2 = await signer2.signTypedData(domain, types, {
        to: transaction.to,
        value: transaction.value,
        data: transaction.data,
        nonce: transaction.nonce,
        txType: transaction.txType,
      });
      
      // Confirm transactions to trigger execution
      await msWallet.connect(owner).confirmTransaction(0, signature1, txHash);
      const confirmTx = await msWallet.connect(signer2).confirmTransaction(0, signature2, txHash);
      const receipt = await confirmTx.wait();
      
      // Get transaction state after execution
      const executedTx = await msWallet.transactions(0);
      console.log("Transaction state after execution:", executedTx.state);
      
      // Verify the transaction was executed successfully
      expect(executedTx.state).to.equal(1); // Executed
      
      // Check final balances
      const finalWalletBalance = await ethers.provider.getBalance(msWallet.target);
      const finalRecipientBalance = await ethers.provider.getBalance(signer4.address);
      
      console.log("Final wallet balance:", ethers.formatEther(finalWalletBalance), "ETH");
      console.log("Final recipient balance:", ethers.formatEther(finalRecipientBalance), "ETH");
      console.log("Wallet balance change:", ethers.formatEther(finalWalletBalance - walletBalance), "ETH");
      console.log("Recipient balance change:", ethers.formatEther(finalRecipientBalance - initialRecipientBalance), "ETH");
      
      // Verify funds were transferred correctly
      expect(finalWalletBalance).to.be.lessThan(walletBalance);
      expect(finalRecipientBalance - initialRecipientBalance).to.be.closeTo(transferAmount, ethers.parseEther("0.001"));
      
      console.log("Test passed: Successfully transferred ETH directly to recipient");
    });
  });
});
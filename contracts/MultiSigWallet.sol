// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "hardhat/console.sol";

contract MultiSigWallet is EIP712 {
    event Deposited(address indexed sender, uint amount);
    event ExecutedTransaction(uint transactionId, TransactionState state);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event TransactionSubmitted(uint transactionId, address indexed sender);
    event TransactionConfirmed(uint transactionId, address indexed signer);
    event TransactionCancelled(uint transactionId);

    enum TransactionType { Normal, AddSigner, RemoveSigner }
    enum TransactionState { Pending, Executed, Failed, Cancelled }

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        uint256 nonce;
        uint8 txType;
        uint confirmations;
        TransactionState state;
    }

    mapping(address => bool) public isSigner;
    address[] public signers;
    uint public immutable threshold;
    uint public nonce;
    uint public transactionId;
    mapping(uint => Transaction) public transactions;
    mapping(uint => mapping(address => bool)) public confirmations;
    mapping(address => uint) public signerIndex;

    uint[] public pendingTransactions;
    mapping(uint => uint) private pendingTxIndex;
    
    
    bytes32 private constant _TRANSACTION_TYPEHASH = keccak256(
        "Transaction(address to,uint256 value,bytes data,uint256 nonce,uint8 txType)"
    );

    constructor(address[] memory _signers, uint _threshold)
        EIP712("MultiSigWallet", "1.0")
    {
        require(_signers.length > 0, "No signers provided");
        require(_threshold > 0 && _threshold <= _signers.length, "Invalid threshold");

        for (uint i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            require(signer != address(0), "Invalid signer");
            require(!isSigner[signer], "Duplicate signer");

            isSigner[signer] = true;
            signers.push(signer);
            signerIndex[signer] = i; // Using zero-based indexing
        }

        threshold = _threshold;
        
        console.log("Contract deployed with:");
        console.log("Total signers: %s", signers.length);
        console.log("threshold:", threshold);
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function submitTransaction(address _to, uint256 _value, bytes calldata _data, uint8 _txType) external {
        Transaction memory newTransaction = Transaction({
            to: _to,
            value: _value,
            data: _data,
            nonce: nonce,
            txType: _txType,
            confirmations: 0,
            state: TransactionState.Pending
        });

        uint currentTxId = transactionId;
        transactions[currentTxId] = newTransaction;
        
        // Add to pending transactions list
        pendingTxIndex[currentTxId] = pendingTransactions.length;
        pendingTransactions.push(currentTxId);
        
        emit TransactionSubmitted(currentTxId, msg.sender);
        transactionId++;
    }

    function confirmTransaction(uint _transactionId, bytes calldata _signature, bytes32 _txHash) external {
        require(isSigner[msg.sender], "Not a signer");
        require(!confirmations[_transactionId][msg.sender], "Already confirmed");
        require(transactions[_transactionId].state == TransactionState.Pending, "Transaction not pending");

        bytes32 calculatedHash = calculateHash(_transactionId);
      
        console.log("CalculatedHash in contract: ");
        console.logBytes32(calculatedHash);
        console.log("CLI txHash: ");
        console.logBytes32(_txHash);

        require(calculatedHash == _txHash, "Invalid transaction hash");

        address signer = ECDSA.recover(_txHash, _signature);
        console.log("Signature: ");
        console.logBytes(_signature);
        console.log("Recovered Signer: ", signer);
        require(signer == msg.sender, "Invalid signature");

        confirmations[_transactionId][msg.sender] = true;
        transactions[_transactionId].confirmations++;
        emit TransactionConfirmed(_transactionId, msg.sender);

        console.log("Total Tx Confirmations: ", transactions[_transactionId].confirmations);
        // Executes only after all k of n signatures
        if (transactions[_transactionId].confirmations >= threshold) {
            console.log("Total Tx Confirmations %s, met required threshold %s, executing ... ", transactions[_transactionId].confirmations, threshold);
            _executeTransaction(_transactionId);
        }
    }

    function calculateHash(uint _transactionId) public view returns (bytes32 txHash){
       return _hashTypedDataV4(
            keccak256(abi.encode(
                _TRANSACTION_TYPEHASH,
                transactions[_transactionId].to,
                transactions[_transactionId].value,
                keccak256(transactions[_transactionId].data),
                transactions[_transactionId].nonce,
                transactions[_transactionId].txType
            ))
        );
    }

    function cancelTransaction(uint _transactionId) external {
        require(isSigner[msg.sender], "Not a signer");
        require(transactions[_transactionId].state == TransactionState.Pending, "Transaction not pending");
        
        transactions[_transactionId].state = TransactionState.Cancelled;
        
        // Remove from pending transactions list
        _removePendingTransaction(_transactionId);
        
        emit TransactionCancelled(_transactionId);
    }
    
    // Helper function to remove a transaction from the pending list
    function _removePendingTransaction(uint _transactionId) private {
        uint index = pendingTxIndex[_transactionId];
        uint lastIndex = pendingTransactions.length - 1;
        
        // If this isn't the last element, move the last element to this position
        if (index != lastIndex) {
            uint lastTxId = pendingTransactions[lastIndex];
            pendingTransactions[index] = lastTxId;
            pendingTxIndex[lastTxId] = index;
        }
        
        // Remove the last element
        pendingTransactions.pop();
        delete pendingTxIndex[_transactionId];
    }

    function _executeTransaction(uint _transactionId) private {
        require(transactions[_transactionId].confirmations >= threshold, "Not enough confirmations");
        require(transactions[_transactionId].state == TransactionState.Pending, "Transaction not pending");
        
        Transaction storage transaction = transactions[_transactionId];

        bool success = false;
   
        if (transaction.txType == uint8(TransactionType.AddSigner)) {
            _executeAddSigner(transaction.data);
            success = true;
        } else if (transaction.txType == uint8(TransactionType.RemoveSigner)) {
            _executeRemoveSigner(transaction.data);
            success = true;
        } else {
            require(transaction.value <= address(this).balance, "Insufficient balance");
            (bool result, ) = transaction.to.call{value: transaction.value}(transaction.data);
            success = result;
        }

        if (success) {
            transaction.state = TransactionState.Executed;
            nonce++;
        } else {
            transaction.state = TransactionState.Failed;
        }
        
        // Remove from pending transactions list
        _removePendingTransaction(_transactionId);

        emit ExecutedTransaction(_transactionId, transaction.state);
    }

    function _executeAddSigner(bytes memory _data) private {
        address newSigner = abi.decode(_data, (address));

        require(newSigner != address(0), "Invalid signer");
        require(!isSigner[newSigner], "Already a signer");

        isSigner[newSigner] = true;
        signers.push(newSigner);
        signerIndex[newSigner] = signers.length - 1;

        emit SignerAdded(newSigner);
    }


    function _executeRemoveSigner(bytes memory _data) private {
        address signerToRemove = abi.decode(_data, (address));

        require(isSigner[signerToRemove], "Not a signer");
        require(signers.length > threshold, "Cannot have fewer signers than threshold");

        isSigner[signerToRemove] = false;

        uint index = signerIndex[signerToRemove];
        signers[index] = signers[signers.length - 1];
        signerIndex[signers[index]] = index; // Update index of signer address for the moved signer
        signers.pop();
        delete signerIndex[signerToRemove];

        emit SignerRemoved(signerToRemove);
    }

    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    function getSignerCount() external view returns (uint) {
            console.log("getSignerCount called");
        return signers.length;
    }
  
    function getPendingTransactions() external view returns (uint[] memory) {
        return pendingTransactions;
    }
    

}
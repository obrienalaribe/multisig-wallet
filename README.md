# MultiSig Wallet

This solution implements a MultiSig Wallet contract that meets the following requirements:

-   [x] The contract supports multisig operations for executing arbitrary calls on other contracts.
    -   [x] K of n signature scheme.
    -   [x] Allows any actor to execute an arbitrary method on an arbitrary contract. K valid signatures must be attached to the transaction.
-   [x] Must be able to update the signer set.
-   [x] Includes operational scripts that demonstrate deployment.
    -   [x] How to initialize the initial signer set.
-   [x] Tests cases for the contract.
-   [x] CLI tool to interact with methods.
    -   [x] Generate a transfer transaction to be signed by a signer set.
    -   [x] Updating signer set transaction.
    -   [x] Demonstrate each participant can sign the transaction.
    -   [x] Execute the transaction only after k of n signatures are provided.
    -   [x] The operational scripts handle both the submission and verification of the multisig transaction, showing how an external party can interact with the contract.
    -   [x] Contains a signature scheme.
    -   [x] Stores signer addresses and their status.
    -   [x] Maintains a threshold of required confirmations.
    -   [x] Functions to add and remove signers through transactions.

## Getting Started

### Prerequisites

-   Node.js and npm installed.
-   Hardhat installed globally or locally.

### Installation

1.  Clone the repository.
2.  Install dependencies:

```bash
npm install
```

### Running the Project

#### Start a local Hardhat node

```bash
npx hardhat node
```


#### Initializing envs (optional)
Initializing the signer set and threshold are **optional for local deployment.** For local testing, the ignition deployment module checks for this and deploys with the test signer accounts with a `2/3 signature threshold set`

```bash
INITIAL_SIGNERS="<address_1>,<address_2>"
THRESHOLD=1
```
#### Deploy Contract
```bash
npx hardhat ignition deploy ./ignition/modules/MultiSigWallet.ts --network localhost
```

#### Script
This script is used to run through simple transaction flow methods on the smart contract to quickly verify its working as intended
```bash
npx hardhat run scripts/run.ts --network localhost
```

### CLI Interaction with contract

#### Submit an arbitrary transaction

```bash
npx hardhat multisig:submit --network localhost
```

#### View pending transactions
```bash
npx hardhat multisig:pending --network localhost
```

#### Sign a transaction 

This task allows you to impersonate signers. The list of whitelisted signers will print on the CLI for you to choose one

```bash
npx hardhat multisig:confirm --id <txID> --signer <address> --network localhost
```

#### Run Tests
```bash
 npx hardhat test
```

### Design Decisions
The contract is designed to meet the requirement to `allow any actor to execute an arbitrary method on an arbitrary contract.` The current implementation allows anyone (not just signers) to submit an arbitrary transaction. This design choice separates transaction submission from confirmation. It allows external users to propose transactions that signers can then approve. Execution only happens after k of n threshold signatures are collected. Hence, only transactions that receive the required number of signer confirmations will actually execute, maintaining security.

No `try-catch` blocks are used for the low-level function `call` since it returns false as its first return value in case of an exception instead of "bubbling up" and reverting. So the transaction state {Pending, Failed ...} is set instead to handle this.


#### Transaction Workflow
- Connect to the contract.
- Submit a test transaction.
- Get the transaction hash from the contract.
- Sign the content of the hash with the k of n signer set.
- Automatically execute after total k of n confirmation is met to improve UX.


#### Security Measures Considered
- Uses OpenZeppelin's EIP712 and ECDSA libraries for secure typed data signature handling.
- Requirement checks throughout the code for transactions and signers.
- Left `console.log` statements for debugging purposes only (will be removed in real deployment).

#### Signature Scheme
The signature scheme uses exact contract values from the contract by getting the transaction data directly and using that for signing. This ensures hash consistency and relies on on-chain data rather than recreating it locally on the client-side, although there are tradeoffs here.


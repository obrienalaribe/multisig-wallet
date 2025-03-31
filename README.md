# MultiSig Wallet

This solution implements a MultiSig Wallet contract that meets the following requirements:

-   [x] The contract supports multisig operations for executing arbitrary calls on other contracts.
    -   [x] K of n signature scheme.
    -   [x] Allows any actor to execute an arbitrary method on an arbitrary contract. K valid signatures must be attached to the transaction.
-   [x] Includes operational scripts that demonstrate deployment and how to initialize the initial signer set.
-   [x] Tests cases for the contract edge cases
-   [x] CLI tool to interact with contract methods to:
    -   [x] Generate a transfer transaction to be confirmed by k signers in the set.
    -   [x] Able to add and remove signers.
    -   [x] Demonstrate each participant can sign a transaction.
    -   [x] Execute the transaction only after k of n signatures are provided.
    -   [x] The operational scripts handle both the submission and verification of response from multisig contract, showing how an external party can interact with the contract.
    -   [x] Contains a signature scheme
    -   [x] Track total confirmations for a transaction and its status.

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
Initializing the signer set and threshold are **optional for local deployment.** For local testing, the ignition deployment module checks for this and deploys with the test signer accounts with a `2/3 signature threshold set`. Otherwise you can set your `.env` as below:

```bash
INITIAL_SIGNERS="<address_1>,<address_2>"
THRESHOLD=k
```

#### Deploy Contract
```bash
npx hardhat ignition deploy ./ignition/modules/MultiSigWallet.ts --network localhost
```

### CLI Interaction with contract

#### Get Balance of account
```bash
npx hardhat balance --account 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --network localhost
```

#### Get all signers
```bash
npx hardhat multisig:signers --network localhost
```

#### Add a new signer
```bash
 npx hardhat multisig:addSigner --address 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 --network localhost
 ```

#### View pending transactions
```bash
npx hardhat multisig:pending --network localhost
```

#### Sign a transaction 

This task allows you to impersonate signers. The signer set will print on the CLI for you to choose one. *Remember to set the ID to that given when you submitted the transaction*

```bash
npx hardhat multisig:confirm --id 0 --signer 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --network localhost

npx hardhat multisig:confirm --id 0 --signer 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --network localhost
```

#### Submit an arbitrary transfer transaction
```bash
 npx hardhat multisig:transfer --to 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --value 1 --network localhost
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


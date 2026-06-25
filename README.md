# Fhenix CoFHE Confidential Prediction Market

![Network](https://img.shields.io/badge/Fhenix_CoFHE_Arbitrum_Sepolia-421614-blue)
![Solidity](https://img.shields.io/badge/Solidity-0.8.28-purple)
![License](https://img.shields.io/badge/license-MIT-green)

FHE-encrypted prediction market — bet amounts and choices are sealed on-chain using CoFHE, revealed only at settlement.

**Deployed on Arbitrum Sepolia**

| Field | Value |
|---|---|
| Network | Arbitrum Sepolia |
| Chain ID | 421614 |
| Contract | `0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB` |
| Explorer | [View Contract](https://sepolia.arbiscan.io/address/0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB) |

---

## Why Fhenix CoFHE-Native

This project is not a port from another chain. Every design decision maps directly to a native capability of Fhenix CoFHE.

| Problem | Generic EVM approach | Fhenix CoFHE-native approach |
|---|---|---|
| Bet amount is public | Plaintext `uint256` visible in storage | `euint64` encrypted — unreadable on-chain |
| Bet choice is public | Plaintext `bool` — anyone can see your position | `ebool` encrypted — impossible to infer stance |
| Instant decryption | Read storage directly | Async `ctHash` — only the threshold network holds the decryption key |
| No access control | Anyone can read all state | ACL via `FHE.allowThis()` / `FHE.allowSender()` — explicit permission required |

---

## Architecture

```
User (Browser / Script)
  │
  ├─ @cofhe/sdk  encrypt(amount: uint64) ──► InEuint64 { ctHash, securityZone, utype, signature }
  └─ @cofhe/sdk  encrypt(choice: bool)   ──► InEbool   { ctHash, securityZone, utype, signature }
                                                │
                                                ▼
                     ConfidentialPredictionMarket.sol  (Arbitrum Sepolia)
                     ┌──────────────────────────────────────────────────┐
                     │  placeBet()      FHE.asEuint64() + FHE.asEbool() │
                     │                 FHE.allowThis() + FHE.allowSender│
                     │                                                  │
                     │  claimWinnings() FHE.eq(ebool, ebool)            │
                     │                 FHE.select(isWinner, amt, 0)     │
                     │                 FHE.allowPublic(encPayout)       │
                     │                                                  │
                     │  withdraw()      FHE.publishDecryptResult()      │
                     └─────────────────────────┬────────────────────────┘
                                               │ createTask()
                                               ▼
                           CoFHE Task Manager (0xeA30...D9)
                                               │
                                               ▼
                      Fhenix Threshold Network (testnet-cofhe.fhenix.zone)
                                               │
                              decryptForTx(ctHash) → (plainPayout, signature)
                                               │
                                               ▼
                                    withdraw(betId, plainPayout, ctHash, sig)
```

---

## Core Features

### Encrypted Bet Placement
Users encrypt their bet amount and choice locally via `@cofhe/sdk`, producing `InEuint64` / `InEbool` structs that are passed to the contract. The contract calls `FHE.asEuint64()` / `FHE.asEbool()` to convert them into on-chain ciphertexts, then grants access via `FHE.allowThis()` (for the contract itself) and `FHE.allowSender()` (for the bettor), ensuring only authorized parties can operate on the ciphertext.

### FHE-Based Winner Verification
`claimWinnings()` never relies on plaintext comparison. The flow:
1. `FHE.asEbool(market.outcome)` encrypts the publicly revealed outcome
2. `FHE.eq(encChoice, outcomeEnc)` privately compares the user's encrypted choice against the outcome
3. `FHE.select(isWinner, encAmount, 0)` computes the encrypted payout
4. `FHE.allowPublic(encPayout)` enables threshold network decryption

The contract itself never learns whether any individual bettor won.

### Threshold Network Settlement
Decryption is performed off-chain by the Fhenix threshold network, returning `(plainPayout, signature)`. The user calls `withdraw()` and submits `FHE.publishDecryptResult()` to verify the signature on-chain before funds are released.

---

## Deployed Contracts

**Arbitrum Sepolia (421614)**

| Contract | Address |
|---|---|
| `ConfidentialPredictionMarket` | `0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB` |

---

## Quick Start

**Prerequisites**
- Node.js 18+
- A funded wallet on Arbitrum Sepolia

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PRIVATE_KEY` | Deployer wallet private key (no 0x prefix) |
| `ARBITRUM_SEPOLIA_RPC` | RPC endpoint (default: public Arb Sepolia RPC) |

```bash
# 3. Compile
npx hardhat compile

# 4. Deploy
npx hardhat run scripts/deploy.ts --network arbitrumSepolia

# 5. Run full e2e (deploy + 7 txs)
npx hardhat run scripts/e2e.ts --network arbitrumSepolia
```

---

## Contract Interface

```solidity
// Create a new prediction market
createMarket(string calldata question) external returns (uint256 marketId)

// Place a bet with FHE-encrypted amount and choice
placeBet(
    uint256 marketId,
    InEuint64 calldata encAmount,   // encrypted bet amount
    InEbool   calldata encChoice    // encrypted choice: true = Yes, false = No
) external payable returns (uint256 betId)

// Lock the betting period
lockMarket(uint256 marketId) external

// Reveal the outcome (market owner only)
submitResult(uint256 marketId, bool outcome) external

// FHE winner computation — stores encrypted payout ctHash
claimWinnings(uint256 betId, uint256 marketId) external

// Finalize withdrawal after off-chain decryption
withdraw(
    uint256 betId,
    uint256 plainPayout,
    uint256 ctHash,
    bytes calldata signature
) external
```

---

## FHE Encryption Flow

### placeBet — Client-side encryption
```
Frontend (SDK)
  Encryptable.uint64(amount) ──► InEuint64
  Encryptable.bool(choice)   ──► InEbool
        │
        ▼
Contract: FHE.asEuint64(encAmount) → euint64
          FHE.asEbool(encChoice)   → ebool
          FHE.allowThis(amount)    ← grants the contract future access
          FHE.allowSender(amount)  ← grants the bettor access to their own ciphertext
```

### claimWinnings — FHE winner verification
```
ebool outcomeEnc  = FHE.asEbool(market.outcome)          // encrypt the public outcome
ebool isWinner    = FHE.eq(bet.encChoice, outcomeEnc)    // private comparison
euint64 encPayout = FHE.select(isWinner, bet.encAmount, FHE.asEuint64(0))
                                                          // encrypted payout
FHE.allowPublic(encPayout)   // enable threshold network decryption
emit WinningsClaimed(betId, msg.sender, encPayoutCtHash)
```

### withdraw — On-chain proof verification
```
Off-chain: client.decryptForTx(encPayoutCtHash).withoutPermit().execute()
        → { plainPayout, ctHash, signature }

On-chain:  FHE.publishDecryptResult(ctHash, plainPayout, signature)
        → verifies threshold network signature
        → transfer(msg.sender, plainPayout)
```

---

## Fees & Security

**Fees**
- No platform fee — all ETH remains in the contract pool
- Losing stakes stay in the pool for winners to claim proportionally (M3 upgrade)

**Security**
- ACL enforcement: every ciphertext requires an explicit `allow*()` call before it can be used
- Threshold network signature verification: `publishDecryptResult()` prevents forged decryption results
- Owner-only operations: `lockMarket` / `submitResult` restricted to the market creator

---

## Implementation Notes

**`evmVersion: "cancun"` is mandatory**
The FHE contracts use transient storage opcodes (`TSTORE` / `TLOAD`). Compilation fails on any `evmVersion` below `cancun`.

**`InEuint64` / `InEbool` are structs, not raw `bytes32`**
Encrypted inputs carry four fields that must be mapped explicitly from SDK output to the Solidity struct:
```solidity
struct InEuint64 {
    uint256 ctHash;       // ciphertext hash
    uint8   securityZone; // security zone
    uint8   utype;        // FHE type enum value
    bytes   signature;    // ZK proof signature
}
```

**FHE operations are asynchronous**
`FHE.eq()` / `FHE.select()` submit tasks to the CoFHE Task Manager within the transaction. The actual computation is performed off-chain by the Fhenix threshold network. After `claimWinnings()` succeeds, the caller must wait for the coprocessor to process the tasks before requesting decryption.

**`publishDecryptResult` takes `uint256 ctHash`, not `bytes32`**
The FHE library's `publishDecryptResult()` expects `uint256` as its first argument. `euint64.unwrap()` returns `bytes32`, so callers must cast when invoking `withdraw()`.

---

## Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity ^0.8.28 |
| Development | Hardhat 2 + `@cofhe/hardhat-plugin` |
| FHE SDK | `@cofhe/sdk` + `@fhenixprotocol/cofhe-contracts` |
| Network | Arbitrum Sepolia (421614) |
| CoFHE endpoint | `https://testnet-cofhe.fhenix.zone` |

---

## Roadmap

**✅ M1 — Core FHE Contract (completed)**
- `ConfidentialPredictionMarket` deployed on Arbitrum Sepolia
- Full e2e flow across 7 transactions: deploy → createMarket → placeBet×2 → lockMarket → submitResult → claimWinnings
- FHE payout `ctHash` correctly emitted; CoFHE decryption task verified

**⬜ M2 — Frontend**
- React + wagmi frontend
- Browser-side CoFHE SDK encryption for bet placement
- Vercel deployment

**⬜ M3 — MarketFactory**
- Support for multiple concurrent prediction markets
- `MarketFactory` contract + market listing frontend

**⬜ M4 — Oracle Integration**
- Chainlink price feed replaces manual `submitResult`
- Automated settlement flow

**⬜ M5 — Advanced FHE**
- Private leaderboard (users can only view their own history)
- Multi-option encrypted voting (`ebool` array)

**⬜ M6 — Mainnet**
- Migration to Fhenix mainnet upon launch

---

## Developer

GitHub: [pplmaverick](https://github.com/pplmaverick)
Wallet: `0xed2B5717c9b936ecC76d75401026A99143e278F5`

## License

MIT

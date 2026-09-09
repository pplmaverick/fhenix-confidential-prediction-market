# Fhenix CoFHE Confidential Prediction Market

[![CI](https://github.com/pplmaverick/fhenix-confidential-prediction-market/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/pplmaverick/fhenix-confidential-prediction-market/actions/workflows/test.yml)
![Network](https://img.shields.io/badge/Fhenix_CoFHE_Arbitrum_Sepolia-421614-blue)
![Solidity](https://img.shields.io/badge/Solidity-0.8.28-purple)
![License](https://img.shields.io/badge/license-MIT-green)

**Live Demo →** [fhenix-confidential-prediction-mark.vercel.app](https://fhenix-confidential-prediction-mark.vercel.app) · Network: Arbitrum Sepolia (Chain ID 421614)

---

FHE-encrypted prediction market — bet amounts and choices are sealed on-chain using CoFHE, revealed only at settlement.

**Deployed on Arbitrum Sepolia**

| Field | Value |
|---|---|
| Network | Arbitrum Sepolia |
| Chain ID | 421614 |
| Contract | `0xBd24A5e2656FDD006c5731c0A8F60c1cd240dFe7` (M3.6) |
| Explorer | [View Contract](https://sepolia.arbiscan.io/address/0xBd24A5e2656FDD006c5731c0A8F60c1cd240dFe7#code) |

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
  └─ @cofhe/sdk  encryptInputs([bool choice])
       .setConsumingContract(addr)  ──► [externalEbool handle, bytes proof]
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
Users encrypt their bet choice locally via `@cofhe/sdk`, producing an `externalEbool` handle plus a batch `proof` that are passed to the contract. The verifier binds the consuming contract address into the signed proof, so a proof issued for one contract cannot be replayed against another. The contract calls `FHE.asEbool(handle, proof)` to convert it into an on-chain ciphertext (the stake amount is encrypted on-chain from `msg.value` via `FHE.asEuint64()`, never supplied by the client), then grants access via `FHE.allowThis()` (for the contract itself) and `FHE.allowSender()` (for the bettor), ensuring only authorized parties can operate on the ciphertext.

### FHE-Based Winner Verification
`claimWinnings()` never relies on plaintext comparison. The flow:
1. `FHE.asEbool(market.outcome)` encrypts the publicly revealed outcome
2. `FHE.eq(encChoice, outcomeEnc)` privately compares the user's encrypted choice against the outcome
3. `FHE.select(isWinner, encAmount, 0)` computes the encrypted payout
4. `FHE.allowPublic(encPayout)` enables threshold network decryption

The contract itself never learns whether any individual bettor won.

### Threshold Network Settlement
Decryption is performed off-chain by the Fhenix threshold network, returning `(plainPayout, signature)`. The user calls `withdraw()` and submits `FHE.publishDecryptResult()` to verify the signature on-chain before funds are released.

### Frontend
A React + wagmi SPA that performs CoFHE encryption in the browser, so bet choices are never sent anywhere in plaintext. Components:

| Component | Purpose |
|---|---|
| `PlaceBetCard` | Encrypts the Yes/No choice via `encryptInputs()` and submits `placeBet()`; also decrypts the user's own past choices for the claim flow |
| `MarketSelector` | Switches between markets by id |
| `MarketCard` | Shows a market's question, pool and lifecycle state (open / locked / resolved) |
| `CreateMarketCard` | Permissionless `createMarket()` from the browser |
| `MyBets` | Lists the connected wallet's bets, decrypting each encrypted choice with the user's own ACP |
| `Portfolio` | Aggregate view of the wallet's stakes and claimable positions |
| `OwnerPanel` | Market-owner actions: `lockMarket`, `submitResult`, `revealWinnerPool` and the off-chain decrypt → `submitWinnerPool` step |
| `ActivityLog` | Running log of encryption steps, tx hashes and errors — the main debugging surface for the FHE flow |
| `Navbar` | Wallet connection and CoFHE client status (connecting / signing / ready) |
| `WrongNetworkBanner` | Warns and offers to switch when the wallet is not on Arbitrum Sepolia |

MetaMask is required — OKX Wallet is incompatible with CoFHE ACP signing.

---

## Deployed Contracts

**Arbitrum Sepolia (421614)**

| Contract | Address | Status |
|---|---|---|
| `ConfidentialPredictionMarket` (M1/M2) | `0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f` | Deprecated — superseded by M3 |
| `ConfidentialPredictionMarket` (M3) | `0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB` | Deprecated — superseded by the M3.1 security patch |
| `MarketFactory` | `0x575FF2bb9f8F5Ef5Bd0198F316Cd7a1a7e8482FA` | Deprecated — unused; the one-contract-per-market design was dropped for the monolithic contract |
| `ConfidentialPredictionMarket` (M3.1) | `0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d` | Deprecated — superseded by the M3.5 view-function update |
| `ConfidentialPredictionMarket` (M3.5) | `0x18A12F0872fDF5859022962931cF4D63b0a8f640` | Deprecated — ABI-incompatible with `@cofhe/sdk` 0.7.1 (`InEbool` removed). No bets were ever placed on it; no funds at risk |
| `ConfidentialPredictionMarket` (M3.6) | `0xBd24A5e2656FDD006c5731c0A8F60c1cd240dFe7` | **Active** |

Full deployment records, tx hashes and deprecation rationale: [DEPLOYMENT.md](DEPLOYMENT.md).

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
| `ETHERSCAN_API_KEY` | Etherscan v2 API key, used by `npx hardhat verify` for Arbiscan source verification. Only needed to verify a deployment |

```bash
# 3. Compile
npx hardhat compile

# 4. Deploy
npx hardhat run scripts/deploy.ts --network arbitrumSepolia

# 5. Run the full 22-step e2e against Arbitrum Sepolia
#    (self-deploys a fresh contract, then exercises both the winner-payout
#     and the no-winners refund flow end to end, with live CoFHE encryption)
npx hardhat run scripts/e2e.ts --network arbitrumSepolia
```

**Running the unit tests requires two terminals.** The CoFHE mocks are deployed by
`@cofhe/hardhat-plugin` into a real node process, and the SDK's mock ZK-verify step makes an
HTTP call to `127.0.0.1:8545` from its own verifier signer — which only exists once a
`hardhat node` is actually listening. The bare in-process `hardhat` network is not enough
for any test that touches FHE encryption.

```bash
# Terminal 1 — leave this running
npx hardhat node

# Terminal 2
npx hardhat test --network localhost
```

---

## Contract Interface

```solidity
// Create a new prediction market. Permissionless — any address may call this;
// the caller becomes the market's owner (controls lockMarket()/submitResult()).
createMarket(string calldata question) external returns (uint256 marketId)

// Create a market on behalf of a given `owner` instead of msg.sender.
// Permissionless — currently unused by the active frontend/scripts.
createMarketFor(string calldata question, address owner) external returns (uint256 marketId)

// Place a bet with an FHE-encrypted choice. The stake amount is the ETH sent
// (msg.value), encrypted on-chain — there is no separate encrypted-amount input.
placeBet(
    uint256 marketId,
    externalEbool encChoice,     // encrypted choice handle: true = Yes, false = No
    bytes calldata proof         // CoFHE batch proof, bound to this contract
) external payable returns (uint256 betId)

// Lock the betting period. Restricted to market.owner (require(msg.sender == market.owner)).
lockMarket(uint256 marketId) external

// Submit the final outcome. Restricted to market.owner; must be called after lockMarket().
submitResult(uint256 marketId, bool outcome) external

// Read all fields of a market in one call. Anyone may call.
getMarketInfo(uint256 marketId) external view returns (
    string memory question,
    address owner,
    bool locked,
    bool resolved,
    bool outcome,
    uint256 totalPool
)

// Return every bet id placed by `user`, across all markets. Anyone may call.
getBetsByAddress(address user) external view returns (uint256[] memory betIds)

// FHE sum of all winning bets' encrypted amounts. Anyone may call after submitResult();
// decrypt the resulting ctHash off-chain, then call submitWinnerPool().
revealWinnerPool(uint256 marketId) external

// Store the decrypted winner pool. Anyone may call, with (plainWinnerPool, ctHash,
// signature) obtained from decryptForTx() on the revealWinnerPool() result.
submitWinnerPool(
    uint256 marketId,
    uint256 plainWinnerPool,
    uint256 ctHash,
    bytes calldata signature
) external

// Settle a market where the decrypted winner pool is zero (nobody picked the winning
// side), verified via the CoFHE decrypt proof. Anyone may call.
settleNoWinners(
    uint256 marketId,
    uint256 ctHash,
    bytes calldata signature
) external

// Reclaim a bet's original stake after settleNoWinners(). Restricted to the bet's
// own bettor (require(bets[betId].bettor == msg.sender)).
withdrawRefund(uint256 betId, uint256 marketId) external

// FHE winner computation — stores encrypted payout ctHash. Restricted to the bet's
// own bettor; requires the market resolved and submitWinnerPool() already called.
claimWinnings(uint256 betId, uint256 marketId) external

// Finalize withdrawal after off-chain decryption of claimWinnings()'s payout.
// Restricted to the bet's own bettor.
withdraw(
    uint256 betId,
    uint256 marketId,
    uint256 plainBetAmount,
    uint256 ctHash,
    bytes calldata signature
) external
```

---

## FHE Encryption Flow

### placeBet — Client-side encryption
```
Frontend (SDK 0.7.1)
  encryptInputs([Encryptable.bool(choice)])
    .setConsumingContract(CONTRACT_ADDRESS)   ← required before execute()
    .execute()  ──► [externalEbool handle, bytes proof]
        │
        ▼
Contract: FHE.asEuint64(msg.value)        → euint64   (amount, never client-supplied)
          FHE.asEbool(handle, proof)      → ebool
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
Off-chain: client.decryptForTx(encPayoutCtHash).withoutACP().execute()
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

**Encrypted inputs are a `bytes32` handle plus a batch proof (`@fhenixprotocol/cofhe-contracts` 0.2.0)**
The old four-field `InEbool` / `InEuint64` structs were removed in 0.2.0. An encrypted input is
now a `externalEbool` (a `bytes32` user-defined value type) accompanied by a `bytes proof`;
`securityZone` and `utype` are no longer passed in calldata (utype is implied by the `asXxx`
overload, securityZone defaults to 0):
```solidity
type externalEbool is bytes32;

function asEbool(externalEbool hash, bytes memory proof) internal returns (ebool);
```
On the client, `encryptInputs()` returns a tuple of per-input handles followed by a single
batch proof, and `.setConsumingContract(addr)` is mandatory before `.execute()` — the verifier
binds that address into the signed digest so the proof cannot be replayed elsewhere.

**FHE operations are asynchronous**
`FHE.eq()` / `FHE.select()` submit tasks to the CoFHE Task Manager within the transaction. The actual computation is performed off-chain by the Fhenix threshold network. After `claimWinnings()` succeeds, the caller must wait for the coprocessor to process the tasks before requesting decryption.

**`publishDecryptResult` takes `uint256 ctHash`, not `bytes32`**
The FHE library's `publishDecryptResult()` expects `uint256` as its first argument. `euint64.unwrap()` returns `bytes32`, so callers must cast when invoking `withdraw()`.

---

## Testing

Two layers: a fast unit suite against local CoFHE mocks, and a full e2e against live
Arbitrum Sepolia + the real Fhenix threshold network.

### Unit tests — 9 tests, local mocks

`@cofhe/hardhat-plugin` auto-deploys mock CoFHE contracts, so encrypt/decrypt resolve
instantly with no external dependency.

```bash
# Terminal 1 — must stay running (see Quick Start for why)
npx hardhat node

# Terminal 2
npx hardhat test --network localhost
```

| Group | Covers |
|---|---|
| `createMarket — permissionless` | any address can create a market |
| `lockMarket — owner-restricted` | reverts for a non-owner; succeeds for `market.owner` |
| `submitResult — lifecycle ordering` | reverts before `lockMarket`; reverts on a second call |
| `getMarketInfo` | returned fields match what `createMarket` recorded |
| `placeBet — boundary case` | reverts on a zero-value bet |
| `getBetsByAddress` | returns only the caller's own bet ids |
| `full lifecycle` | placeBet → lock → resolve → claimWinnings → withdraw, with real FHE encrypt/decrypt, asserting the sole winner receives the entire pool |

### End-to-end — 22 steps, live testnet

```bash
npx hardhat run scripts/e2e.ts --network arbitrumSepolia
```

Deploys a fresh contract, then walks two full markets:

- **Market 0 (winner flow)** — createMarket → placeBet(Yes) → placeBet(No) → lockMarket →
  submitResult → revealWinnerPool → threshold-network decrypt → submitWinnerPool →
  claimWinnings → decrypt payout → withdraw. Step 13 replays the same decrypt proof and
  asserts it reverts, verifying the M3.1 double-claim protection.
- **Market 1 (no-winners flow)** — a market where nobody picked the winning side;
  asserts the decrypted winner pool is 0, then settles via `settleNoWinners()` and
  reclaims the stake with `withdrawRefund()`.
- **Step 22** verifies the M3.5 view functions (`getMarketInfo`, `getBetsByAddress`).

Both `placeBet` calls run live `encryptInputs()` against the Fhenix verifier, so this is the
path that exercises the real ZK proof flow rather than mocks.

Supporting audit scripts (all accept `CONTRACT_ADDRESS` from the environment):

| Script | Purpose |
|---|---|
| `scripts/check-markets.ts` | Dump every market's question, owner, lifecycle state and pool |
| `scripts/check-bettors.ts` | Scan `BetPlaced` logs to confirm whether any non-dev wallet has funds in a contract before deprecating it |
| `scripts/create-and-seed-bets.ts` | Create markets and place real encrypted bets against a given deployment |

---

## Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity ^0.8.28 |
| Development | Hardhat 2 + `@cofhe/hardhat-plugin` |
| FHE SDK | `@cofhe/sdk` 0.7.1 + `@fhenixprotocol/cofhe-contracts` 0.2.0 |
| Network | Arbitrum Sepolia (421614) |
| CoFHE endpoint | `https://testnet-cofhe.fhenix.zone` |

---

## Roadmap

**✅ M1 — Core FHE Contract (completed)**
- `ConfidentialPredictionMarket` deployed on Arbitrum Sepolia
- Full e2e flow across 7 transactions: deploy → createMarket → placeBet×2 → lockMarket → submitResult → claimWinnings
- FHE payout `ctHash` correctly emitted; CoFHE decryption task verified

**✅ M2 — Frontend (completed)**
- React + wagmi frontend with browser-side CoFHE SDK encryption
- MetaMask required (OKX Wallet incompatible with CoFHE permit signing)
- Deployed: https://fhenix-confidential-prediction-mark.vercel.app

**✅ M3 — Permissionless Market Creation & Proportional Payout (completed)**
- Originally planned to use a `MarketFactory` (one contract instance per market) for permissionless creation; same day, this was found to conflict with the main contract's market-listing mechanism (factory-created markets lived in separate contracts, invisible to the shared market list)
- Switched to `createMarket()` directly on the monolithic contract, tracked via internal `nextMarketId()`/`markets()` mapping — M3's permissionless-creation goal was still achieved
- Proportional payout logic: winners share pool based on bet size
- Verified e2e: +0.019971 ETH delta confirmed
- M3.1 Security Patch: bind encAmount to msg.value, add withdraw double-claim protection (betId-keyed mapping), handle winnerPool=0 with settleNoWinners()+withdrawRefund()

**✅ M3.5 — View Functions & Hardening (completed)**
- Added `getMarketInfo(marketId)` and `getBetsByAddress(user)` view functions to cut frontend RPC calls (no new storage — `getBetsByAddress` scans the existing `bets` mapping rather than paying extra SSTORE gas on every `placeBet()`)
- Full NatSpec on `createMarket`, `createMarketFor`, `lockMarket`, `submitResult`, documenting the `require(msg.sender == market.owner)` restriction and the absence of any on-chain `endTime` concept
- 9-test unit suite added, covering permissions, lifecycle ordering, boundary cases and the full placeBet→withdraw flow against local CoFHE mocks

**✅ M3.6 — @cofhe/sdk 0.7.1 Migration (completed)**
- Compatibility release, not a feature milestone: `@cofhe/sdk` 0.6.1 posted ZK proofs to `POST /verify`, an endpoint Fhenix removed in the 0.7.x rollout, so every `encryptInputs()` call failed with `ZK_VERIFY_FAILED`. Diagnosed by probing the verifier directly (`/verify` → 404, `/verifyBatch` → 422 naming the new `contract_address` field) and cross-validated against the official `cofhe-hardhat-starter` on 0.7.1, which worked
- Upgraded `@cofhe/sdk` 0.6.1 → 0.7.1, `@cofhe/hardhat-plugin` 0.6.0 → 0.7.1, `@fhenixprotocol/cofhe-contracts` 0.1.4 → 0.2.0
- `InEbool` removed upstream: `placeBet` now takes `(uint256, externalEbool, bytes proof)`, an ABI break that forced a redeployment to `0xBd24A5e2656FDD006c5731c0A8F60c1cd240dFe7`
- Client side: `encryptInputs()` requires `.setConsumingContract()` and returns `[...handles, proof]`; the permits API was replaced by ACP
- Verified with 9/9 unit tests plus a complete 22-step live e2e including real on-chain `placeBet` calls

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

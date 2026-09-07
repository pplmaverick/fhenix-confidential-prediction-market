# Deployment History

## Network: Arbitrum Sepolia (Chain ID: 421614)

### Active Contracts

| Contract | Address | Deployed | Status |
|---|---|---|---|
| ConfidentialPredictionMarket | 0x18A12F0872fDF5859022962931cF4D63b0a8f640 | M3.5 | Active |

### M3.5 View Function Update Deployment

| Field | Value |
|---|---|
| Address | 0x18A12F0872fDF5859022962931cF4D63b0a8f640 |
| Deploy tx | 0x87819d0dd3ae650593ece87f33c2b04556b20a287aa3177a088e6f07be32520f |
| Date | 2026-09-07 |
| Network | Arbitrum Sepolia (421614) |
| Verified | https://sepolia.arbiscan.io/address/0x18A12F0872fDF5859022962931cF4D63b0a8f640#code |

Changes:
- Added `getMarketInfo(marketId)` and `getBetsByAddress(user)` view functions to reduce frontend RPC calls (no new storage — `getBetsByAddress` scans the existing `bets` mapping rather than paying extra SSTORE gas on every `placeBet()`).
- Added full NatSpec (`@notice`/`@param`/`@return`) to `createMarket`, `createMarketFor`, `lockMarket`, `submitResult`, documenting the `require(msg.sender == market.owner)` restriction and the absence of any on-chain `endTime` concept.
- Contract logic fully verified via a 9-test unit suite (`test/ConfidentialPredictionMarket.test.ts`) using `@cofhe/hardhat-plugin`'s local mock CoFHE environment, covering permission checks, lifecycle ordering, boundary cases, and the full placeBet→claimWinnings→withdraw flow with FHE encrypt/decrypt.

Note: On 2026-09-07, testnet-cofhe.fhenix.zone experienced a ZK_VERIFY_FAILED error affecting encryptInputs() on both old and new contracts equally — confirmed via side-by-side diagnostic test, ruling out the M3.5 changes as the cause. Contract logic fully verified via 9 unit tests using @cofhe/hardhat-plugin mock environment. Live testnet e2e verification pending service recovery.

### M3.1 Security Patch Deployment

| Field | Value |
|---|---|
| Address | 0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d |
| Deploy tx | 0x675323436baa15e2ea34bca599880d30f1e91ddd8db7e1851afd9ce98d9cf597 |
| Date | 2026-07-08 |
| Network | Arbitrum Sepolia (421614) |
| Verified | https://sepolia.arbiscan.io/address/0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d#code |

Fixes:
- **encAmount/msg.value binding** — `placeBet` no longer accepts an arbitrary encrypted amount; it encrypts `msg.value` directly on-chain, closing a fake-amount exploit where an attacker could encrypt a large stake while paying minimal ETH.
- **withdraw double-claim protection** — added a betId-keyed `betWithdrawn` mapping (checks-effects-interactions ordering) so a decrypt proof can't be replayed to drain the pool. Keyed by betId rather than (address, marketId) to avoid locking a second legitimate bet from the same bettor in the same market.
- **winnerPool=0 refund mechanism** — `submitWinnerPool` now rejects a zero winner pool; added `settleNoWinners()` (verifies the zero result via the CoFHE decrypt proof) and `withdrawRefund()` so bettors can reclaim their stake when nobody picks the winning side, instead of funds being permanently stuck.

All three fixes verified end-to-end on-chain via the extended `scripts/e2e.ts` (21-step run covering the winner-payout flow, a replayed `withdraw()` call confirming it reverts, and a no-winners market settled via `settleNoWinners`/`withdrawRefund`).

### Deprecated Contracts

| Contract | Address | Note |
|---|---|---|
| ConfidentialPredictionMarket (M3.1) | 0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d | Deprecated at M3.5 (2026-09-07) — superseded by view-function update (getMarketInfo/getBetsByAddress + NatSpec). Markets #0-#7 preserved for history (#0-#1 resolved; #2-#6 unresolved, all bettors confirmed to be Lucas's own wallets; #7 empty, created during diagnostic testing). Snapshot in docs/evidence/pre-m3.5-market-snapshot.md. New markets created on new contract from this point. |
| ConfidentialPredictionMarket (M3) | 0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB | Deprecated at M3.1 (2026-07-08) — superseded by the security patch above; preserved for history |
| ConfidentialPredictionMarket (M1/M2) | 0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f | Deprecated at M3 — retains 36 tx history |
| MarketFactory | 0x575FF2bb9f8F5Ef5Bd0198F316Cd7a1a7e8482FA | Deprecated/Unused — deployed 2026-06-25 as an alternative "one contract per market" architecture, superseded same day (commit ca4be16) by the current monolithic-contract design where createMarket() is called directly and markets are tracked via nextMarketId()/markets() mapping. Frontend references removed in commit 9c383c3. Contract remains deployed on-chain but is not part of the active system. |

### Explorer
- Active contract (M3.5): https://sepolia.arbiscan.io/address/0x18A12F0872fDF5859022962931cF4D63b0a8f640#code
- Deprecated (M3.1): https://sepolia.arbiscan.io/address/0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d
- Deprecated (M3): https://sepolia.arbiscan.io/address/0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB
- Deprecated (M1/M2): https://sepolia.arbiscan.io/address/0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f
- Deprecated/Unused (MarketFactory): https://sepolia.arbiscan.io/address/0x575FF2bb9f8F5Ef5Bd0198F316Cd7a1a7e8482FA

## Transaction History

| Date | Action | Tx / Note |
|---|---|---|
| M1 | deploy + e2e (7 tx) | createMarket → placeBet×2 → lockMarket → submitResult → claimWinnings |
| M2 | frontend integration | 36 tx accumulated on deprecated contract |
| M3 | proportional payout e2e | +0.019971 ETH delta verified |
| 2026-07-02 | maintenance e2e | e2e-proportional-payout.ts, all tx successful — see docs/evidence/e2e-log.md |
| 2026-07-08 | M3.1 security patch deploy + verify | Deploy tx 0x675323436baa15e2ea34bca599880d30f1e91ddd8db7e1851afd9ce98d9cf597; verified on Arbiscan; full 21-step e2e.ts run confirmed Fix #1–#3 on-chain, including a rejected double-withdraw and a settled no-winners refund |
| 2026-09-07 | M3.5 view-function update deploy + verify | Deploy tx 0x87819d0dd3ae650593ece87f33c2b04556b20a287aa3177a088e6f07be32520f; verified on Arbiscan; logic verified via 9-test local mock unit suite. Live testnet e2e blocked by a testnet-cofhe.fhenix.zone ZK_VERIFY_FAILED service issue confirmed (via side-by-side old/new contract diagnostic) to be unrelated to this change — pending service recovery |

## Frontend

| Environment | URL |
|---|---|
| Production | https://fhenix-confidential-prediction-mark.vercel.app |

## SDK Version

| Package | Version |
|---|---|
| @cofhe/sdk | 0.6.1 |
| @cofhe/hardhat-plugin | (see package.json) |

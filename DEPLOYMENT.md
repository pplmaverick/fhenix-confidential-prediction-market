# Deployment History

## Network: Arbitrum Sepolia (Chain ID: 421614)

### Active Contracts

| Contract | Address | Deployed | Status |
|---|---|---|---|
| ConfidentialPredictionMarket | 0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB | M3 | Active |
| MarketFactory | 0x575FF2bb9f8F5Ef5Bd0198F316Cd7a1a7e8482FA | M3 | Active |

### Deprecated Contracts

| Contract | Address | Note |
|---|---|---|
| ConfidentialPredictionMarket (M1/M2) | 0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f | Deprecated at M3 — retains 36 tx history |

### Explorer
- Active contract: https://sepolia.arbiscan.io/address/0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB
- MarketFactory: https://sepolia.arbiscan.io/address/0x575FF2bb9f8F5Ef5Bd0198F316Cd7a1a7e8482FA
- Deprecated: https://sepolia.arbiscan.io/address/0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f

## Transaction History

| Date | Action | Tx / Note |
|---|---|---|
| M1 | deploy + e2e (7 tx) | createMarket → placeBet×2 → lockMarket → submitResult → claimWinnings |
| M2 | frontend integration | 36 tx accumulated on deprecated contract |
| M3 | proportional payout e2e | +0.019971 ETH delta verified |
| 2026-07-02 | maintenance e2e | e2e-proportional-payout.ts, all tx successful — see docs/evidence/e2e-log.md |

## Frontend

| Environment | URL |
|---|---|
| Production | https://fhenix-confidential-prediction-mark.vercel.app |

## SDK Version

| Package | Version |
|---|---|
| @cofhe/sdk | 0.6.0 |
| @cofhe/hardhat-plugin | (see package.json) |

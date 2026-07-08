# Deployment History

## Network: Arbitrum Sepolia (Chain ID: 421614)

### Active Contracts

| Contract | Address | Deployed | Status |
|---|---|---|---|
| ConfidentialPredictionMarket | 0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d | M3.1 | Active |
| MarketFactory | 0x575FF2bb9f8F5Ef5Bd0198F316Cd7a1a7e8482FA | M3 | Active |

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
| ConfidentialPredictionMarket (M3) | 0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB | Deprecated at M3.1 (2026-07-08) — superseded by the security patch above; preserved for history |
| ConfidentialPredictionMarket (M1/M2) | 0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f | Deprecated at M3 — retains 36 tx history |

### Explorer
- Active contract (M3.1): https://sepolia.arbiscan.io/address/0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d
- MarketFactory: https://sepolia.arbiscan.io/address/0x575FF2bb9f8F5Ef5Bd0198F316Cd7a1a7e8482FA
- Deprecated (M3): https://sepolia.arbiscan.io/address/0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB
- Deprecated (M1/M2): https://sepolia.arbiscan.io/address/0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f

## Transaction History

| Date | Action | Tx / Note |
|---|---|---|
| M1 | deploy + e2e (7 tx) | createMarket → placeBet×2 → lockMarket → submitResult → claimWinnings |
| M2 | frontend integration | 36 tx accumulated on deprecated contract |
| M3 | proportional payout e2e | +0.019971 ETH delta verified |
| 2026-07-02 | maintenance e2e | e2e-proportional-payout.ts, all tx successful — see docs/evidence/e2e-log.md |
| 2026-07-08 | M3.1 security patch deploy + verify | Deploy tx 0x675323436baa15e2ea34bca599880d30f1e91ddd8db7e1851afd9ce98d9cf597; verified on Arbiscan; full 21-step e2e.ts run confirmed Fix #1–#3 on-chain, including a rejected double-withdraw and a settled no-winners refund |

## Frontend

| Environment | URL |
|---|---|
| Production | https://fhenix-confidential-prediction-mark.vercel.app |

## SDK Version

| Package | Version |
|---|---|
| @cofhe/sdk | 0.6.0 |
| @cofhe/hardhat-plugin | (see package.json) |

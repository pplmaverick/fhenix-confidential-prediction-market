# E2E Evidence Log

## 2026-07-02 — Maintenance Run

- **Date:** 2026-07-02
- **Network:** Arbitrum Sepolia (chainId 421614)
- **Contract:** `0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB`
- **MarketFactory:** `0x575FF2bb9f8F5Ef5Bd0198F316Cd7a1a7e8482FA`
- **Script used:** `scripts/e2e-proportional-payout.ts`
- **SDK version:** `@cofhe/sdk 0.6.0`

### Flow

createMarket → placeBet A (YES, 0.01 ETH) → placeBet B (NO, 0.02 ETH) → lockMarket →
submitResult (YES wins) → revealWinnerPool → CoFHE decrypt → submitWinnerPool →
claimWinnings → CoFHE decrypt → withdraw

### Transactions

| # | Action | Tx Hash | Arbiscan |
|---|--------|---------|----------|
| 1 | createMarket | `0xdc5e5300d2b1daea6514ca0ea1f228b54a78ec04bfd50f667ea6c3ee939df295` | https://sepolia.arbiscan.io/tx/0xdc5e5300d2b1daea6514ca0ea1f228b54a78ec04bfd50f667ea6c3ee939df295 |
| 2 | placeBet A (YES) | `0x280239ccda9a3ce8ec4471520dcbb4a590400fc7929b7d33c37cccdbeb48a3be` | https://sepolia.arbiscan.io/tx/0x280239ccda9a3ce8ec4471520dcbb4a590400fc7929b7d33c37cccdbeb48a3be |
| 3 | placeBet B (NO) | `0xf0bcb124a3eb163ea7262335b779255cc8c24568f3cb7be6aeeecf3aca3253c7` | https://sepolia.arbiscan.io/tx/0xf0bcb124a3eb163ea7262335b779255cc8c24568f3cb7be6aeeecf3aca3253c7 |
| 4 | lockMarket | `0x801048deeb828f13fe7dd4979fddebcf177261a988167dd04b72fb93dfd1e2ca` | https://sepolia.arbiscan.io/tx/0x801048deeb828f13fe7dd4979fddebcf177261a988167dd04b72fb93dfd1e2ca |
| 5 | submitResult | `0xc3285c48e1a681aaebde14be84fa6236430bc7761ebd89c62c0d34e14bdecee3` | https://sepolia.arbiscan.io/tx/0xc3285c48e1a681aaebde14be84fa6236430bc7761ebd89c62c0d34e14bdecee3 |
| 6 | revealWinnerPool | `0x5630cb3656ef9c97961ba428b9d0d8c643a56941f142ed19eda75ded49247c0b` | https://sepolia.arbiscan.io/tx/0x5630cb3656ef9c97961ba428b9d0d8c643a56941f142ed19eda75ded49247c0b |
| 7 | submitWinnerPool | `0x0bc54e68396bddbc763024e50a198584a2c364dcbd1597c8551bac092694532b` | https://sepolia.arbiscan.io/tx/0x0bc54e68396bddbc763024e50a198584a2c364dcbd1597c8551bac092694532b |
| 8 | claimWinnings | `0x970364164029352fcd6e5ec59e116e9f0f204439a3d1ce75edcb1cad6b943896` | https://sepolia.arbiscan.io/tx/0x970364164029352fcd6e5ec59e116e9f0f204439a3d1ce75edcb1cad6b943896 |
| 9 | withdraw | `0x9c937b61a1540696a14e26bda1f65268313f77396f266d8833164bbfb954f147` | https://sepolia.arbiscan.io/tx/0x9c937b61a1540696a14e26bda1f65268313f77396f266d8833164bbfb954f147 |

All 9 transactions confirmed successful (`status=1`) via Etherscan V2 API for Arbitrum Sepolia.

### Payout Verification

- Market ID: `7`
- Wallet A: `0xed2B5717c9b936ecC76d75401026A99143e278F5`
- Wallet B: `0x32beaE97f99a91dBff3fb41a63724E1cf333CbAE`
- Total pool: `0.03 ETH`
- Winner pool (decrypted): `0.01 ETH`
- Wallet A bet amount (decrypted): `0.01 ETH`
- Formula: `0.01 × 0.03 / 0.01 = 0.03 ETH`
- Result: **proportional payout confirmed** — matches expected value
- Wallet A balance: `0.809593548953456 ETH` → `0.829542027196514 ETH` (net `+0.019948478243058 ETH`, payout minus gas across 8 signed transactions)

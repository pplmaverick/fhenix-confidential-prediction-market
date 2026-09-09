# Deployment History

## Network: Arbitrum Sepolia (Chain ID: 421614)

### Active Contracts

| Contract | Address | Deployed | Status |
|---|---|---|---|
| ConfidentialPredictionMarket | 0xBd24A5e2656FDD006c5731c0A8F60c1cd240dFe7 | M3.6 | Active |

### M3.6 — @cofhe/sdk 0.7.1 Migration Deployment

Numbered M3.6 rather than M4: this is a compatibility/maintenance release forced by an
upstream breaking change, not a feature milestone. M4 remains reserved for Oracle
Integration on the roadmap.

| Field | Value |
|---|---|
| Address | 0xBd24A5e2656FDD006c5731c0A8F60c1cd240dFe7 |
| Deploy tx | 0x3fa195bd2e664f1cff451f67bca5d447a29a9cb32c7a31be112f4bce0f2c2ad7 |
| Date | 2026-09-09 |
| Network | Arbitrum Sepolia (421614) |
| Verified | https://sepolia.arbiscan.io/address/0xBd24A5e2656FDD006c5731c0A8F60c1cd240dFe7#code |

Why this redeployment was required:

`@cofhe/sdk` 0.6.1 posts ZK proofs to `POST {verifierUrl}/verify`. Fhenix removed that
endpoint in the 0.7.x rollout (0.7.0, published 2026-08-19), replacing it with
`POST {verifierUrl}/verifyBatch`, which additionally requires a `contract_address` field
binding the batch signature to the consuming contract. Every `encryptInputs()` call from
0.6.1 therefore hit a 404 that surfaced as `ZK_VERIFY_FAILED`. There is no 0.6.x patch —
0.6.1 (2026-07-08) is the last 0.6.x release — so upgrading to 0.7.x was the only path.

The 0.7.x contract library (`@fhenixprotocol/cofhe-contracts` 0.2.0) removes the `InEbool`
struct in favour of `asEbool(externalEbool, bytes proof)`, which changes the `placeBet` ABI
and made a redeployment mandatory:

```
old: placeBet(uint256, (uint256,uint8,uint8,bytes))  selector 0x56bf32bb
new: placeBet(uint256, bytes32, bytes)               selector 0x8c87e464
```

Changes:
- Dependencies: `@cofhe/sdk` 0.6.1 → 0.7.1, `@cofhe/hardhat-plugin` 0.6.0 → 0.7.1,
  `@fhenixprotocol/cofhe-contracts` 0.1.4 → 0.2.0 (root and frontend).
- Contract: `placeBet` now takes `(uint256 marketId, externalEbool encChoice, bytes proof)`
  and calls `FHE.asEbool(encChoice, proof)`. The unused `InEuint64` import was dropped.
- SDK call sites: `encryptInputs()` now requires `.setConsumingContract(address)` before
  `.execute()`, and returns `[...perInputHashes, batchProof]` instead of per-value
  `{ctHash, securityZone, utype, signature}` structs.
- Permits API replaced by ACP: `permits.getOrCreateSelfPermit()` → `acp.getOrCreateSelfACP()`
  (frontend, idempotent) / `acp.createSelf({issuer})` (scripts); `decryptForTx(...).withoutPermit()`
  → `.withoutACP()`; `decryptForView(...).withPermit()` → `.withACP()`.

Verification:
- 9/9 unit tests pass against the local mock CoFHE environment (`hardhat node` + `--network localhost`).
- `scripts/e2e.ts` completed all 22 steps on Arbitrum Sepolia, including real on-chain
  `placeBet()` calls with live `encryptInputs()` — the exact path that was previously blocked.
  (The e2e script self-deploys a throwaway contract at Step 1; that run used
  `0xA26B8E46d267A412ae75961B41856C01f05A7259`.)
- The shipping contract above was separately exercised with three live encrypted bets via
  `scripts/create-and-seed-bets.ts` (markets #0–#2, `nextBetId()` = 3, balance 0.0003 ETH),
  confirming `encryptInputs()` → `placeBet()` works against this specific address.

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

Note (superseded 2026-09-09): this section previously recorded the 2026-09-07
`ZK_VERIFY_FAILED` failures as a Fhenix service-side outage. That diagnosis was wrong.
Cross-validation on 2026-09-09 — running the official `cofhe-hardhat-starter` (SDK 0.7.1)
on Arbitrum Sepolia with the same dev wallet, which succeeded — proved the service was
healthy. The real cause was client-side: SDK 0.6.1 calls `POST /verify`, an endpoint Fhenix
removed in the 0.7.x rollout (direct probe: `/verify` → HTTP 404 empty body,
`/verifyBatch` → HTTP 422 naming the missing `contract_address` field). The empty 404 body
is what produced the truncated `ZK_VERIFY_FAILED: ... - ` message. Resolved by the M3.6
migration above. Evidence: `docs/evidence/pre-0.7.1-migration-snapshot.md`.

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
| ConfidentialPredictionMarket (M3.5) | 0x18A12F0872fDF5859022962931cF4D63b0a8f640 | Deprecated due to @cofhe/sdk 0.6.1→0.7.1 breaking change (InEbool removed, ABI incompatible). No bets were ever successfully placed on this contract (blocked by SDK calling a removed /verify endpoint). Market #0 orphaned, no funds at risk. Verified before deprecation: `nextBetId()` = 0, contract balance 0 ETH, 0 `BetPlaced` events. Snapshot in docs/evidence/pre-0.7.1-migration-snapshot.md. |
| ConfidentialPredictionMarket (M3.1) | 0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d | Deprecated at M3.5 (2026-09-07) — superseded by view-function update (getMarketInfo/getBetsByAddress + NatSpec). Markets #0-#7 preserved for history (#0-#1 resolved; #2-#6 unresolved, all bettors confirmed to be Lucas's own wallets; #7 empty, created during diagnostic testing). Snapshot in docs/evidence/pre-m3.5-market-snapshot.md. New markets created on new contract from this point. |
| ConfidentialPredictionMarket (M3) | 0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB | Deprecated at M3.1 (2026-07-08) — superseded by the security patch above; preserved for history |
| ConfidentialPredictionMarket (M1/M2) | 0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f | Deprecated at M3 — retains 36 tx history |
| MarketFactory | 0x575FF2bb9f8F5Ef5Bd0198F316Cd7a1a7e8482FA | Deprecated/Unused — deployed 2026-06-25 as an alternative "one contract per market" architecture, superseded same day (commit ca4be16) by the current monolithic-contract design where createMarket() is called directly and markets are tracked via nextMarketId()/markets() mapping. Frontend references removed in commit 9c383c3. Contract remains deployed on-chain but is not part of the active system. |

### Explorer
- Active contract (M3.6): https://sepolia.arbiscan.io/address/0xBd24A5e2656FDD006c5731c0A8F60c1cd240dFe7#code
- Deprecated (M3.5): https://sepolia.arbiscan.io/address/0x18A12F0872fDF5859022962931cF4D63b0a8f640
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

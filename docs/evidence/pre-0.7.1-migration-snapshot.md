# Pre-migration snapshot — @cofhe/sdk 0.6.1 → 0.7.1

Fund-safety check performed **before** deploying the SDK-0.7.1-compatible contract,
per the standing rule that no contract is superseded without first proving on-chain
that no third-party funds are stranded in it.

- **Date:** 2026-09-09
- **Network:** Arbitrum Sepolia (chainId 421614)
- **Contract under review (M3.5):** `0x18A12F0872fDF5859022962931cF4D63b0a8f640`
- **Deploy tx:** `0x87819d0dd3ae650593ece87f33c2b04556b20a287aa3177a088e6f07be32520f`
- **Scanned block range:** 306378239 → 307107645
- **Chain head at snapshot:** 307107784

## Why this contract is being superseded

`@cofhe/sdk` 0.6.1 posts ZK proofs to `POST {verifierUrl}/verify`. Fhenix removed that
endpoint in the 0.7.x rollout (0.7.0, published 2026-08-19) and replaced it with
`POST {verifierUrl}/verifyBatch`, which additionally requires a `contract_address` field
binding the batch signature to the consuming contract.

Direct probe of `https://testnet-cofhe-vrf.fhenix.zone` on 2026-09-09:

| Endpoint | Used by | Result |
|---|---|---|
| `POST /verify` | @cofhe/sdk 0.6.1 | **HTTP 404, empty body** |
| `POST /verifyBatch` | @cofhe/sdk 0.7.1 | HTTP 422 `missing field 'contract_address'` (endpoint live, validating) |

The empty 404 body is exactly what surfaced client-side as
`ZK_VERIFY_FAILED: HTTP error! ZK proof verification failed - ` (nothing after the dash).

Cross-validated by cloning the official `cofhe-hardhat-starter` (SDK 0.7.1) and running it
on Arbitrum Sepolia with the same dev wallet: `deploy-counter`, `increment-counter` and
`reset-counter` (the task that actually calls `encryptInputs()`) all succeeded. The service
is healthy; 0.6.1 was calling a deleted endpoint. There is no 0.6.x patch release —
0.6.1 (2026-07-08) is the last 0.6.x, so upgrading to 0.7.x is the only path.

The 0.7.x contract interface drops the `InEbool` struct in favour of
`asEbool(externalEbool, bytes proof)`, which changes the `placeBet` ABI and therefore
requires a redeployment:

```
old: placeBet(uint256, (uint256,uint8,uint8,bytes))  selector 0x56bf32bb
new: placeBet(uint256, bytes32, bytes)               selector 0x8c87e464
```

## On-chain state at snapshot

### Markets — `scripts/check-markets.ts`

```
CONTRACT_ADDRESS=0x18A12F0872fDF5859022962931cF4D63b0a8f640 \
  npx hardhat run scripts/check-markets.ts --network arbitrumSepolia
```

```
nextMarketId: 1 (markets 0..0)

Market #0
  Question:   Will BTC reach $100,000 before October 2026? | Ends: 2026-09-30
  Owner:      0xed2B5717c9b936ecC76d75401026A99143e278F5
  Locked:     false
  Resolved:   false
  TotalPool:  0.0 ETH
```

### Bets — `scripts/check-bettors.ts`

```
CONTRACT_ADDRESS=0x18A12F0872fDF5859022962931cF4D63b0a8f640 \
DEPLOY_TX_HASH=0x87819d0dd3ae650593ece87f33c2b04556b20a287aa3177a088e6f07be32520f \
MARKET_IDS=0 \
  npx hardhat run scripts/check-bettors.ts --network arbitrumSepolia
```

```
Scanning blocks 306378239 → 307107645 in chunks of 10000

Market #0 — 0 bet(s)
  (no bets placed)

✅ All bets across markets #0 were placed by the dev wallet.
```

### Independent corroboration (direct RPC)

| Check | Value |
|---|---|
| Contract ETH balance | **0.0 ETH** |
| `nextMarketId()` | 1 |
| `nextBetId()` | **0** |
| `BetPlaced` events in range | **0** |

## Conclusion

**No funds at risk.** `nextBetId() == 0` proves `placeBet()` never completed successfully
on this contract — consistent with the root cause, since every bet attempt died in
`encryptInputs()` before a transaction was ever submitted. The contract holds 0 ETH and
`Market #0` is empty, so it is orphaned metadata only, with no third-party stake to migrate
or refund. Safe to deprecate.

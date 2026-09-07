# Pre-M3.5 Market Snapshot

Recorded before deprecating the M3.1 contract and deploying the M3.5
view-function update, so market history isn't lost when a new contract
(with its own empty `nextMarketId` counter) takes over as Active.

- Contract: `0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d` (M3.1, Arbitrum Sepolia)
- Snapshot date: 2026-09-07
- Source: `scripts/check-markets.ts` + `scripts/check-bettors.ts`

## Market status (`scripts/check-markets.ts`)

```
Contract: 0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d
nextMarketId: 7 (markets 0..6)

Market #0
  Question:   Will BTC break $150,000 before 2027? | Ends: 2026-07-08T23:59
  Owner:      0xed2B5717c9b936ecC76d75401026A99143e278F5
  Locked:     true
  Resolved:   true
  Outcome:    NO wins
  TotalPool:  0.03 ETH

Market #1
  Question:   Will ETH break $5,000 before 2027?
  Owner:      0xed2B5717c9b936ecC76d75401026A99143e278F5
  Locked:     true
  Resolved:   true
  Outcome:    NO wins
  TotalPool:  0.001 ETH

Market #2
  Question:   Will BTC dominance exceed 60% in Q3 2026?
  Owner:      0xed2B5717c9b936ecC76d75401026A99143e278F5
  Locked:     false
  Resolved:   false
  TotalPool:  0.001 ETH

Market #3
  Question:   Will Fhenix mainnet launch before 2027?
  Owner:      0xed2B5717c9b936ecC76d75401026A99143e278F5
  Locked:     false
  Resolved:   false
  TotalPool:  0.0 ETH

Market #4
  Question:   Will ETH reach $3,000 before end of 2026?
  Owner:      0xed2B5717c9b936ecC76d75401026A99143e278F5
  Locked:     false
  Resolved:   false
  TotalPool:  0.0001 ETH

Market #5
  Question:   Will Bitcoin ETF daily inflow exceed $1B in Q4 2026?
  Owner:      0xed2B5717c9b936ecC76d75401026A99143e278F5
  Locked:     false
  Resolved:   false
  TotalPool:  0.0001 ETH

Market #6
  Question:   Will Fhenix TGE happen before March 2027?
  Owner:      0xed2B5717c9b936ecC76d75401026A99143e278F5
  Locked:     false
  Resolved:   false
  TotalPool:  0.0001 ETH
```

Note: this contract has no on-chain `endTime`/`closeTime` field, and YES/NO
stake amounts remain FHE-encrypted per bet — only the aggregate `totalPool`
is plaintext.

## Bettor addresses for markets #2–#6 (`scripts/check-bettors.ts`)

| Market | Bets | betId | Bettor | Amount | Claimed | Tx |
|---|---|---|---|---|---|---|
| #2 | 1 | 3 | `0xE7eAd5c02955a25d159D84320CE8571990537F7c` | 0.001 ETH | false | `0xfb552d896c072461f4b2407e48712cc3402fb3d15271c4f61afafce9e7f3392e` |
| #3 | 0 | — | (no bets placed) | — | — | — |
| #4 | 1 | 4 | `0xed2B5717c9b936ecC76d75401026A99143e278F5` | 0.0001 ETH | — | `0xfb13dc6c075a2cf230bc887e271a3251d007b5f4568962cf7b190a318ee7a638` |
| #5 | 1 | 5 | `0xed2B5717c9b936ecC76d75401026A99143e278F5` | 0.0001 ETH | — | `0xa2d9ae404c7d2c18dc480d3fab520b5c4a428adc08dc5b05d73caf1157ee578b` |
| #6 | 1 | 6 | `0xed2B5717c9b936ecC76d75401026A99143e278F5` | 0.0001 ETH | — | `0x9a840f43ef7b2329673caa5d50de9d909df954f3e51dc3b98edaf095f8f8b6e3` |

`0xE7eAd5c02955a25d159D84320CE8571990537F7c` was flagged as a non-dev
address during the pre-deployment fund safety check; confirmed by Lucas to
be his own second wallet, not third-party funds. All bets across markets
#2–#6 are self-funded.

Note: Market #7 (empty, created during post-deployment diagnostic test on
2026-09-07 to confirm ZK_VERIFY_FAILED was a CoFHE testnet service-side
issue, not related to the M3.5 contract changes) exists on the old
contract but was never used.

## Disposition

Markets #0–#1 are resolved (NO won both). Markets #2–#6 are unlocked and
unresolved, and remain on the deprecated M3.1 contract — they are not
migrated to the new M3.5 contract. All new markets from M3.5 onward are
created on the new contract, starting again from `nextMarketId = 0`.

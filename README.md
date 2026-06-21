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
| Contract | `0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f` |
| Explorer | [View Contract](https://sepolia.arbiscan.io/address/0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f) |

---

## Why Fhenix CoFHE-Native

這個專案不是從其他鏈 port 過來的。每個設計決策都對應到 Fhenix CoFHE 的原生加密能力。

| Problem | Generic EVM approach | Fhenix CoFHE-native approach |
|---|---|---|
| 下注金額可見 | 明文 `uint256` 儲存在 storage | `euint64` 加密，鏈上無法讀取 |
| 選擇可見 | 明文 `bool`，任何人可查 | `ebool` 加密，無法推斷用戶立場 |
| 即時解密 | 直接讀 storage 即可 | async `ctHash`，僅閾值網路持有解密金鑰 |
| 無存取控制 | 任何人可讀所有狀態 | ACL `FHE.allowThis()` / `FHE.allowSender()` 明確授權 |

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
用戶透過 `@cofhe/sdk` 在本地加密下注金額與選擇，產生 `InEuint64` / `InEbool` 結構傳入合約。合約呼叫 `FHE.asEuint64()` / `FHE.asEbool()` 轉換後，以 `FHE.allowThis()` 授權合約本身、`FHE.allowSender()` 授權用戶，確保只有合法方可存取密文。

### FHE-Based Winner Verification
`claimWinnings()` 不依賴明文比對。流程：
1. `FHE.asEbool(market.outcome)` 將公開結果加密
2. `FHE.eq(encChoice, outcomeEnc)` 私密比對用戶選擇與結果
3. `FHE.select(isWinner, encAmount, 0)` 計算加密獎金
4. `FHE.allowPublic(encPayout)` 允許閾值網路解密

整個驗證過程中，合約本身無法知道用戶是否獲勝。

### Threshold Network Settlement
解密由 Fhenix 閾值網路執行於鏈下，回傳 `(plainPayout, signature)`。用戶呼叫 `withdraw()` 提交 `FHE.publishDecryptResult()` 驗證簽名後，合約才發放獎金。

---

## Deployed Contracts

**Arbitrum Sepolia (421614)**

| Contract | Address |
|---|---|
| `ConfidentialPredictionMarket` | `0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f` |

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

// Lock betting period
lockMarket(uint256 marketId) external

// Reveal outcome (market owner only)
submitResult(uint256 marketId, bool outcome) external

// FHE winner computation → stores encrypted payout ctHash
claimWinnings(uint256 betId, uint256 marketId) external

// Finalize after off-chain decryption
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
          FHE.allowThis(amount)    ← 授權合約未來可使用
          FHE.allowSender(amount)  ← 授權用戶查看自己的密文
```

### claimWinnings — FHE winner verification
```
ebool outcomeEnc  = FHE.asEbool(market.outcome)         // 公開結果加密
ebool isWinner    = FHE.eq(bet.encChoice, outcomeEnc)   // 私密比對
euint64 encPayout = FHE.select(isWinner, bet.encAmount, FHE.asEuint64(0))
                                                         // 加密獎金
FHE.allowPublic(encPayout)  // 允許閾值網路解密
emit WinningsClaimed(betId, msg.sender, encPayoutCtHash)
```

### withdraw — On-chain proof verification
```
Off-chain: client.decryptForTx(encPayoutCtHash).withoutPermit().execute()
        → { plainPayout, ctHash, signature }

On-chain:  FHE.publishDecryptResult(ctHash, plainPayout, signature)
        → 驗證閾值網路簽名
        → transfer(msg.sender, plainPayout)
```

---

## Fees & Security

**Fees**
- 本合約無平台抽成，所有 ETH 留在合約池中
- 未獲勝者的 ETH 留在池中，由獲勝者按比例提取（M3 升級）

**Security**
- ACL 強制存取控制：每個加密值需明確 `allow*()` 才可操作
- 閾值網路簽名驗證：`publishDecryptResult()` 防止偽造解密結果
- Owner-only 操作：`lockMarket` / `submitResult` 僅限市場創建者

---

## Implementation Notes

**`evmVersion: "cancun"` 為強制必要**
FHE 合約使用 transient storage opcodes（`TSTORE` / `TLOAD`），若 evmVersion 低於 cancun 則編譯失敗。

**`InEuint64` / `InEbool` struct 結構**
加密輸入不是單純的 `bytes32`，而是包含四個欄位的 struct：
```solidity
struct InEuint64 {
    uint256 ctHash;       // 密文 hash
    uint8   securityZone; // 安全區域
    uint8   utype;        // FHE 類型 enum
    bytes   signature;    // ZK proof 簽名
}
```
SDK 輸出需手動對應到此 struct 才能傳入合約。

**FHE 操作為非同步**
`FHE.eq()` / `FHE.select()` 等操作在 tx 中只是提交 task 給 CoFHE Task Manager，實際計算由 Fhenix 閾值網路離鏈完成。`claimWinnings()` tx 成功後，需等待 coprocessor 處理完畢才能拿到解密結果。

**`publishDecryptResult` 接受 `uint256 ctHash`**
FHE library 的 `publishDecryptResult()` 第一個參數為 `uint256`，非 `bytes32`。`euint64.unwrap()` 回傳 `bytes32`，事件 emit 時需注意型別，呼叫 `withdraw()` 時須轉型。

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
- `ConfidentialPredictionMarket` 合約部署於 Arbitrum Sepolia
- e2e 完整流程 7 筆 tx（deploy → createMarket → placeBet×2 → lockMarket → submitResult → claimWinnings）
- FHE payout ctHash 正確輸出，CoFHE 解密任務驗證通過

**⬜ M2 — Frontend**
- React + wagmi 前端
- 瀏覽器端 CoFHE SDK 加密下注
- Vercel 部署

**⬜ M3 — MarketFactory**
- 支援同時多個預測市場
- MarketFactory 合約 + 市場列表前端

**⬜ M4 — Oracle Integration**
- Chainlink price feed 取代手動 submitResult
- 自動化結算流程

**⬜ M5 — Advanced FHE**
- Private leaderboard（用戶只能看自己的歷史）
- 多選加密投票（`ebool` array）

**⬜ M6 — Mainnet**
- Fhenix 主網上線後遷移部署

---

## Developer

GitHub: [pplmaverick](https://github.com/pplmaverick)
Wallet: `0xed2B5717c9b936ecC76d75401026A99143e278F5`

## License

MIT

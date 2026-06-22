import hre from "hardhat";

const CONTRACT_ADDRESS = "0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f";
const MARKET_ID = 2;

const ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "betId", type: "uint256" },
      { internalType: "uint256", name: "marketId", type: "uint256" },
    ],
    name: "claimWinnings",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "markets",
    outputs: [
      { internalType: "string", name: "question", type: "string" },
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "bool", name: "locked", type: "bool" },
      { internalType: "bool", name: "resolved", type: "bool" },
      { internalType: "bool", name: "outcome", type: "bool" },
      { internalType: "uint256", name: "totalPool", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "bets",
    outputs: [
      { internalType: "uint256", name: "encAmount", type: "uint256" },
      { internalType: "uint256", name: "encChoice", type: "uint256" },
      { internalType: "uint256", name: "plainAmount", type: "uint256" },
      { internalType: "address", name: "bettor", type: "address" },
      { internalType: "bool", name: "claimed", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nextBetId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "uint256", name: "", type: "uint256" },
    ],
    name: "marketBets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const contract = await hre.ethers.getContractAt(ABI, CONTRACT_ADDRESS, signer);

  const market = await (contract as any).markets(MARKET_ID);
  console.log(`Market #${MARKET_ID}: "${market[0]}"`);
  console.log(`  Resolved: ${market[3]}, Outcome: ${market[4] ? "YES" : "NO"}`);

  if (!market[3]) {
    console.error("\n❌ Market not resolved yet. Run submitResult.ts first.");
    process.exit(1);
  }

  // 找出屬於 signer 且在 market #1 的 betId
  const nextBetId = await (contract as any).nextBetId();
  console.log(`\nTotal bets: ${nextBetId}`);

  let foundBetId: bigint | null = null;
  for (let i = 0n; i < nextBetId; i++) {
    const bet = await (contract as any).bets(i);
    if (bet.bettor.toLowerCase() === signer.address.toLowerCase() && !bet.claimed) {
      console.log(`  Bet #${i}: bettor=${bet.bettor}, amount=${hre.ethers.formatEther(bet.plainAmount)} ETH, claimed=${bet.claimed}`);
      foundBetId = i;
    }
  }

  if (foundBetId === null) {
    console.log("\n⚠️  No unclaimed bets found for this account on market #1.");
    console.log("   (需要先從前端下注，才能 claim)");
    return;
  }

  console.log(`\nClaiming winnings for betId=${foundBetId}...`);
  const tx = await (contract as any).claimWinnings(foundBetId, MARKET_ID);
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("✅ claimWinnings sent. FHE payout computation triggered on-chain.");
  console.log("   下一步需要透過 CoFHE network 解密 pendingPayouts 後再呼叫 withdraw()");
}

main().catch((e) => { console.error(e); process.exit(1); });

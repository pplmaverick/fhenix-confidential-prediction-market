import hre from "hardhat";

const CONTRACT_ADDRESS = "0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f";
const MARKET_ID = Number(process.env.MARKET_ID ?? 2);
const OUTCOME = (process.env.OUTCOME ?? 'true') === 'true'; // true = YES wins

const ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "outcome", type: "bool" },
    ],
    name: "submitResult",
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
] as const;

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const contract = await hre.ethers.getContractAt(ABI, CONTRACT_ADDRESS, signer);

  const market = await (contract as any).markets(MARKET_ID);
  console.log(`Market #${MARKET_ID}: "${market[0]}"`);
  console.log(`  Locked:   ${market[2]}`);
  console.log(`  Resolved: ${market[3]}`);

  if (!market[2]) {
    console.error("\n❌ Market not locked yet. Run lockMarket.ts first.");
    process.exit(1);
  }
  if (market[3]) {
    console.log("\n⚠️  Market already resolved, skipping.");
    return;
  }

  console.log(`\nSubmitting outcome: ${OUTCOME ? "YES (true)" : "NO (false)"}`);
  const tx = await (contract as any).submitResult(MARKET_ID, OUTCOME);
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("✅ Result submitted. Market resolved.");
}

main().catch((e) => { console.error(e); process.exit(1); });

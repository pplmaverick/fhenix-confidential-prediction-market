import hre from "hardhat";

const CONTRACT_ADDRESS = "0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d";
const MARKET_ID = Number(process.env.MARKET_ID ?? 2);

const ABI = [
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "lockMarket",
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
  console.log(`  Owner:    ${market[1]}`);
  console.log(`  Locked:   ${market[2]}`);
  console.log(`  Resolved: ${market[3]}`);

  if (market[2]) {
    console.log("\n⚠️  Market already locked, skipping.");
    return;
  }

  const tx = await (contract as any).lockMarket(MARKET_ID);
  console.log("\nTx hash:", tx.hash);
  await tx.wait();
  console.log("✅ Market locked.");
}

main().catch((e) => { console.error(e); process.exit(1); });

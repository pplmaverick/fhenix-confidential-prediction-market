import hre from "hardhat";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
if (!CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not set in env");

const MARKET_ID_ENV = process.env.MARKET_ID;
if (!MARKET_ID_ENV) throw new Error("MARKET_ID not set in env");
const MARKET_ID = Number(MARKET_ID_ENV);

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

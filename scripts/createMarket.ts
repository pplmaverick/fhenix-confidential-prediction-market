import hre from "hardhat";

const CONTRACT_ADDRESS = "0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d";

const ABI = [
  {
    inputs: [{ internalType: "string", name: "question", type: "string" }],
    name: "createMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "nextMarketId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
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
  console.log("Signer:", signer.address);
  console.log(
    "Balance:",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(signer.address)),
    "ETH"
  );

  const contract = await hre.ethers.getContractAt(ABI, CONTRACT_ADDRESS, signer);

  const question = process.env.MARKET_QUESTION || "Will BTC exceed $100K by end of 2026?";
  console.log("\nCreating market:", question);

  const tx = await (contract as any).createMarket(question);
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);

  const newMarketId = (await (contract as any).nextMarketId()) - 1n;
  console.log("\n✅ New marketId:", newMarketId.toString());

  const market = await (contract as any).markets(newMarketId);
  console.log("   Question:", market[0]);
  console.log("   Owner:   ", market[1]);
  console.log("   Locked:  ", market[2]);
  console.log("   Resolved:", market[3]);
  console.log("   Status:  ", !market[2] && !market[3] ? "OPEN ✓" : "NOT OPEN");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

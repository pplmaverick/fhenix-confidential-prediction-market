import hre from "hardhat";

const CONTRACT_ADDRESS = "0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d";

const ABI = [
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
  const contract = await hre.ethers.getContractAt(ABI, CONTRACT_ADDRESS, signer);

  const nextMarketId: bigint = await (contract as any).nextMarketId();
  const count = Number(nextMarketId);
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`nextMarketId: ${count} (markets 0..${count - 1})\n`);

  if (count === 0) {
    console.log("No markets created yet.");
    return;
  }

  for (let id = 0; id < count; id++) {
    const m = await (contract as any).markets(id);
    const [question, owner, locked, resolved, outcome, totalPool] = m;

    console.log(`Market #${id}`);
    console.log(`  Question:   ${question}`);
    console.log(`  Owner:      ${owner}`);
    console.log(`  Locked:     ${locked}`);
    console.log(`  Resolved:   ${resolved}`);
    if (resolved) {
      console.log(`  Outcome:    ${outcome ? "YES wins" : "NO wins"}`);
    }
    console.log(`  TotalPool:  ${hre.ethers.formatEther(totalPool)} ETH`);
    console.log("");
  }

  console.log(
    "NOTE: this contract (ConfidentialPredictionMarket) has no on-chain endTime/closeTime field,\n" +
    "and YES/NO stake amounts remain FHE-encrypted per bet (encChoice) — only the aggregate\n" +
    "totalPool is plaintext. A YES/NO split and an expiry check are not derivable from chain\n" +
    "state alone without the off-chain decrypt flow (revealWinnerPool → submitWinnerPool)."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

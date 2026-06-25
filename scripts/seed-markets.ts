/**
 * seed-markets.ts
 *
 * Create demo markets on the deployed ConfidentialPredictionMarket contract.
 * Run after a fresh deployment to restore a meaningful market listing.
 *
 * Run:
 *   npx hardhat run scripts/seed-markets.ts --network arbitrumSepolia
 */

import hre from "hardhat";

const CONTRACT_ADDRESS = "0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB";

const MARKETS = [
  "Will BTC exceed $100K by end of 2026?",
  "Will the Iran-Israel war reach a ceasefire before end of June 2026?",
  "Will ETH 2.0 staking APR drop below 3% in 2026?",
  "Will a spot BTC ETF exceed $50B AUM by end of 2026?",
  "Will Solana flip Ethereum in total TVL by end of 2026?",
];

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer  :", signer.address);

  const contract = await hre.ethers.getContractAt(
    "ConfidentialPredictionMarket",
    CONTRACT_ADDRESS,
    signer
  );

  const nextBefore = await contract.nextMarketId();
  console.log("nextMarketId before:", nextBefore.toString());

  async function txOpts() {
    const fee = await hre.ethers.provider.getFeeData();
    return {
      maxFeePerGas: fee.maxFeePerGas ? fee.maxFeePerGas * 2n : undefined,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? undefined,
    };
  }

  for (const question of MARKETS) {
    const tx = await contract.createMarket(question, await txOpts());
    const rc = await tx.wait();
    const marketId = await contract.nextMarketId() - 1n;
    console.log(`  #${marketId}  "${question}"  tx: ${rc?.hash ?? tx.hash}`);
  }

  const nextAfter = await contract.nextMarketId();
  console.log("\n✅ Done — nextMarketId now:", nextAfter.toString());
  console.log("   Total markets:", nextAfter.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

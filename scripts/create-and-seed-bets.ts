/**
 * create-and-seed-bets.ts
 *
 * Create new markets on the deployed ConfidentialPredictionMarket contract
 * and place one CoFHE-encrypted test bet on each.
 *
 * Run:
 *   npx hardhat run scripts/create-and-seed-bets.ts --network arbitrumSepolia
 */

import hre from "hardhat";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/node";
import { arbSepolia } from "@cofhe/sdk/chains";
import { Encryptable } from "@cofhe/sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia as viemArbSepolia } from "viem/chains";

const CONTRACT_ADDRESS = "0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d";
const STAKE = "0.0001"; // ETH per test bet

const MARKETS: { question: string; betYes: boolean }[] = [
  { question: "Will ETH reach $3,000 before end of 2026?", betYes: true },
  { question: "Will Bitcoin ETF daily inflow exceed $1B in Q4 2026?", betYes: false },
  { question: "Will Fhenix TGE happen before March 2027?", betYes: true },
];

function toInEbool(enc: { ctHash: bigint; securityZone: number; utype: number; signature: string }) {
  return {
    ctHash: enc.ctHash,
    securityZone: enc.securityZone,
    utype: enc.utype,
    signature: enc.signature,
  };
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const RPC =
    process.env.ARBITRUM_SEPOLIA_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";

  console.log("Signer :", signer.address);
  console.log(
    "Balance:",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(signer.address)),
    "ETH"
  );

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not set in .env");
  const account = privateKeyToAccount(`0x${privateKey}`);

  const publicClient = createPublicClient({ chain: viemArbSepolia, transport: http(RPC) });
  const walletClient = createWalletClient({ chain: viemArbSepolia, transport: http(RPC), account });

  const cofheConfig = createCofheConfig({ supportedChains: [arbSepolia] });
  const cofheClient = createCofheClient(cofheConfig);
  await cofheClient.connect(publicClient, walletClient);
  await cofheClient.permits.getOrCreateSelfPermit();
  console.log("CoFHE client ready\n");

  const contract = await hre.ethers.getContractAt(
    "ConfidentialPredictionMarket",
    CONTRACT_ADDRESS,
    signer
  );

  const results: { marketId: string; question: string; createTx: string; betTx: string; choice: string }[] = [];

  for (const { question, betYes } of MARKETS) {
    console.log(`\n=== Creating market: "${question}" ===`);
    const createTx = await contract.createMarket(question);
    const createRc = await createTx.wait();
    const marketId = (await contract.nextMarketId()) - 1n;
    console.log(`  Market ID: ${marketId}`);
    console.log(`  Tx hash:   ${createRc?.hash ?? createTx.hash}`);

    console.log(`  Encrypting choice (${betYes ? "Yes" : "No"}) via CoFHE...`);
    const [encChoice] = await cofheClient.encryptInputs([Encryptable.bool(betYes)]).execute();

    const betTx = await contract.placeBet(marketId, toInEbool(encChoice as any), {
      value: hre.ethers.parseEther(STAKE),
    });
    const betRc = await betTx.wait();
    console.log(`  Bet placed: ${betYes ? "Yes" : "No"}, ${STAKE} ETH`);
    console.log(`  Tx hash:    ${betRc?.hash ?? betTx.hash}`);

    results.push({
      marketId: marketId.toString(),
      question,
      createTx: createRc?.hash ?? createTx.hash,
      betTx: betRc?.hash ?? betTx.hash,
      choice: betYes ? "Yes" : "No",
    });
  }

  console.log("\n\n=== SUMMARY ===");
  for (const r of results) {
    console.log(`#${r.marketId} "${r.question}"`);
    console.log(`   createMarket tx: ${r.createTx}`);
    console.log(`   placeBet(${r.choice}) tx: ${r.betTx}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

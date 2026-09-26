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

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
if (!CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not set in env");

const STAKE = "0.0001"; // ETH per test bet

// Each market gets one YES bet (wallet A / PRIVATE_KEY) and one NO bet
// (wallet B / PRIVATE_KEY_2).
const MARKETS: { question: string }[] = [
  { question: "Will BTC close above $120,000 on 2026-10-15? | Ends: 2026-10-15" },
  { question: "Will ETH close above $5,000 on 2026-10-31? | Ends: 2026-10-31" },
  { question: "Will Arbitrum Sepolia gas stay below 0.1 gwei on 2026-09-27? | Ends: 2026-09-27" },
];

async function main() {
  const RPC =
    process.env.ARBITRUM_SEPOLIA_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";

  const pk1 = process.env.PRIVATE_KEY;
  const pk2 = process.env.PRIVATE_KEY_2;
  if (!pk1) throw new Error("PRIVATE_KEY not set in .env");
  if (!pk2) throw new Error("PRIVATE_KEY_2 not set in .env");

  const signerA = new hre.ethers.Wallet(`0x${pk1}`, hre.ethers.provider);
  const signerB = new hre.ethers.Wallet(pk2, hre.ethers.provider);

  console.log("Signer A (YES):", signerA.address);
  console.log(
    "Balance A      :",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(signerA.address)),
    "ETH"
  );
  console.log("Signer B (NO) :", signerB.address);
  console.log(
    "Balance B      :",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(signerB.address)),
    "ETH"
  );

  const accountA = privateKeyToAccount(`0x${pk1}`);
  const accountB = privateKeyToAccount(pk2 as `0x${string}`);

  const publicClient = createPublicClient({ chain: viemArbSepolia, transport: http(RPC) });
  const walletClientA = createWalletClient({ chain: viemArbSepolia, transport: http(RPC), account: accountA });
  const walletClientB = createWalletClient({ chain: viemArbSepolia, transport: http(RPC), account: accountB });

  const cofheConfig = createCofheConfig({ supportedChains: [arbSepolia] });

  const cofheClientA = createCofheClient(cofheConfig);
  await cofheClientA.connect(publicClient, walletClientA);
  await cofheClientA.acp.createSelf({ issuer: accountA.address });

  const cofheClientB = createCofheClient(cofheConfig);
  await cofheClientB.connect(publicClient, walletClientB);
  await cofheClientB.acp.createSelf({ issuer: accountB.address });
  console.log("CoFHE clients ready\n");

  const contractA = await hre.ethers.getContractAt(
    "ConfidentialPredictionMarket",
    CONTRACT_ADDRESS,
    signerA
  );
  const contractB = contractA.connect(signerB);

  const results: {
    marketId: string;
    question: string;
    createTx: string;
    betYesTx: string;
    betNoTx: string;
  }[] = [];

  for (const { question } of MARKETS) {
    console.log(`\n=== Creating market: "${question}" ===`);
    const createTx = await contractA.createMarket(question);
    const createRc = await createTx.wait();
    const marketId = (await contractA.nextMarketId()) - 1n;
    console.log(`  Market ID: ${marketId}`);
    console.log(`  Tx hash:   ${createRc?.hash ?? createTx.hash}`);

    console.log("  Wallet A encrypting choice (YES) via CoFHE...");
    const [encChoiceYes, proofYes] = await cofheClientA
      .encryptInputs([Encryptable.bool(true)])
      .setConsumingContract(CONTRACT_ADDRESS)
      .execute();

    const betYesTx = await contractA.placeBet(marketId, encChoiceYes, proofYes, {
      value: hre.ethers.parseEther(STAKE),
    });
    const betYesRc = await betYesTx.wait();
    console.log(`  Bet placed: YES (wallet A), ${STAKE} ETH`);
    console.log(`  Tx hash:    ${betYesRc?.hash ?? betYesTx.hash}`);

    console.log("  Wallet B encrypting choice (NO) via CoFHE...");
    const [encChoiceNo, proofNo] = await cofheClientB
      .encryptInputs([Encryptable.bool(false)])
      .setConsumingContract(CONTRACT_ADDRESS)
      .execute();

    const betNoTx = await contractB.placeBet(marketId, encChoiceNo, proofNo, {
      value: hre.ethers.parseEther(STAKE),
    });
    const betNoRc = await betNoTx.wait();
    console.log(`  Bet placed: NO (wallet B), ${STAKE} ETH`);
    console.log(`  Tx hash:    ${betNoRc?.hash ?? betNoTx.hash}`);

    results.push({
      marketId: marketId.toString(),
      question,
      createTx: createRc?.hash ?? createTx.hash,
      betYesTx: betYesRc?.hash ?? betYesTx.hash,
      betNoTx: betNoRc?.hash ?? betNoTx.hash,
    });
  }

  console.log("\n\n=== SUMMARY ===");
  for (const r of results) {
    console.log(`#${r.marketId} "${r.question}"`);
    console.log(`   createMarket tx:   ${r.createTx}`);
    console.log(`   placeBet(YES) tx:  ${r.betYesTx}`);
    console.log(`   placeBet(NO) tx:   ${r.betNoTx}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

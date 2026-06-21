/**
 * e2e.ts — Full end-to-end test for ConfidentialPredictionMarket
 *
 * Flow:
 *   1. Deploy contract
 *   2. createMarket
 *   3. placeBet(Yes)  — encrypted choice = true
 *   4. placeBet(No)   — encrypted choice = false
 *   5. lockMarket
 *   6. submitResult (outcome = true → Yes wins)
 *   7. claimWinnings (betId=0, the Yes bet)
 *
 * Run:
 *   npx hardhat run scripts/e2e.ts --network arbitrumSepolia
 */

import hre from "hardhat";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/node";
import { arbSepolia } from "@cofhe/sdk/chains";
import { Encryptable } from "@cofhe/sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia as viemArbSepolia } from "viem/chains";

// ── Helpers ──────────────────────────────────────────────────────────────────

function step(n: number, title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Step ${n}: ${title}`);
  console.log("─".repeat(60));
}

function log(label: string, value: string) {
  console.log(`  ${label.padEnd(14)}: ${value}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔐 Fhenix ConfidentialPredictionMarket — E2E Test");
  console.log("   Network: Arbitrum Sepolia (chainId 421614)");
  console.log("   CoFHE:   https://testnet-cofhe.fhenix.zone");

  // ── Signer ───────────────────────────────────────────────────────────────
  const [signer] = await hre.ethers.getSigners();
  const RPC =
    process.env.ARBITRUM_SEPOLIA_RPC ??
    "https://sepolia-rollup.arbitrum.io/rpc";

  log("Wallet", signer.address);
  log("Balance", hre.ethers.formatEther(await hre.ethers.provider.getBalance(signer.address)) + " ETH");

  // ── CoFHE Client Setup ────────────────────────────────────────────────────
  console.log("\n  Initialising CoFHE client...");

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY not set in .env");

  const account = privateKeyToAccount(`0x${privateKey}`);

  const publicClient = createPublicClient({
    chain: viemArbSepolia,
    transport: http(RPC),
  });

  const walletClient = createWalletClient({
    chain: viemArbSepolia,
    transport: http(RPC),
    account,
  });

  const cofheConfig = createCofheConfig({
    supportedChains: [arbSepolia],
  });
  const cofheClient = createCofheClient(cofheConfig);
  await cofheClient.connect(publicClient, walletClient);
  await cofheClient.permits.getOrCreateSelfPermit();
  console.log("  ✅ CoFHE client ready");

  // ── Step 1: Deploy ────────────────────────────────────────────────────────
  step(1, "Deploy ConfidentialPredictionMarket");

  const Factory = await hre.ethers.getContractFactory("ConfidentialPredictionMarket");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  log("Address", contractAddress);
  log("Tx hash", deployTx?.hash ?? "n/a");

  // ── Step 2: createMarket ─────────────────────────────────────────────────
  step(2, "createMarket");

  const question = "Will ETH exceed $5000 by end of 2025?";
  const tx2 = await contract.createMarket(question);
  const rc2 = await tx2.wait();
  log("Question", question);
  log("Tx hash", rc2?.hash ?? tx2.hash);

  const marketId = 0n;
  log("Market ID", marketId.toString());

  // ── Helper: build InEuint64 / InEbool from SDK encrypted output ───────────
  function toInEuint64(enc: { ctHash: bigint; securityZone: number; utype: number; signature: string }) {
    return {
      ctHash: enc.ctHash,
      securityZone: enc.securityZone,
      utype: enc.utype,
      signature: enc.signature,
    };
  }

  function toInEbool(enc: { ctHash: bigint; securityZone: number; utype: number; signature: string }) {
    return {
      ctHash: enc.ctHash,
      securityZone: enc.securityZone,
      utype: enc.utype,
      signature: enc.signature,
    };
  }

  const STAKE = hre.ethers.parseEther("0.0001"); // 0.0001 ETH per bet

  // ── Step 3: placeBet(Yes) ─────────────────────────────────────────────────
  step(3, "placeBet — encrypted choice = Yes (true)");

  console.log("  Encrypting inputs via CoFHE...");
  const [encAmount1, encChoice1] = await cofheClient
    .encryptInputs([
      Encryptable.uint64(BigInt(hre.ethers.parseEther("0.0001").toString())),
      Encryptable.bool(true), // Yes
    ])
    .execute();

  const tx3 = await contract.placeBet(
    marketId,
    toInEuint64(encAmount1 as any),
    toInEbool(encChoice1 as any),
    { value: STAKE }
  );
  const rc3 = await tx3.wait();
  log("Choice (enc)", "true = Yes");
  log("Stake", hre.ethers.formatEther(STAKE) + " ETH");
  log("Tx hash", rc3?.hash ?? tx3.hash);
  log("Bet ID", "0");

  // ── Step 4: placeBet(No) ──────────────────────────────────────────────────
  step(4, "placeBet — encrypted choice = No (false)");

  console.log("  Encrypting inputs via CoFHE...");
  const [encAmount2, encChoice2] = await cofheClient
    .encryptInputs([
      Encryptable.uint64(BigInt(hre.ethers.parseEther("0.0001").toString())),
      Encryptable.bool(false), // No
    ])
    .execute();

  const tx4 = await contract.placeBet(
    marketId,
    toInEuint64(encAmount2 as any),
    toInEbool(encChoice2 as any),
    { value: STAKE }
  );
  const rc4 = await tx4.wait();
  log("Choice (enc)", "false = No");
  log("Stake", hre.ethers.formatEther(STAKE) + " ETH");
  log("Tx hash", rc4?.hash ?? tx4.hash);
  log("Bet ID", "1");

  // ── Step 5: lockMarket ────────────────────────────────────────────────────
  step(5, "lockMarket");

  const tx5 = await contract.lockMarket(marketId);
  const rc5 = await tx5.wait();
  log("Market ID", marketId.toString());
  log("Tx hash", rc5?.hash ?? tx5.hash);

  // ── Step 6: submitResult ──────────────────────────────────────────────────
  step(6, "submitResult — outcome = true (Yes wins)");

  const tx6 = await contract.submitResult(marketId, true);
  const rc6 = await tx6.wait();
  log("Outcome", "true = Yes wins");
  log("Tx hash", rc6?.hash ?? tx6.hash);

  // ── Step 7: claimWinnings ─────────────────────────────────────────────────
  step(7, "claimWinnings — bet #0 (Yes bet)");

  const tx7 = await contract.claimWinnings(0n, marketId);
  const rc7 = await tx7.wait();
  log("Bet ID", "0 (Yes bet)");
  log("Tx hash", rc7?.hash ?? tx7.hash);

  // Extract encrypted payout ctHash from WinningsClaimed event
  const event = rc7?.logs?.find((l: any) => {
    try {
      const parsed = contract.interface.parseLog({ topics: l.topics, data: l.data });
      return parsed?.name === "WinningsClaimed";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsed = contract.interface.parseLog({ topics: (event as any).topics, data: (event as any).data });
    if (parsed) {
      log("encPayout", parsed.args[2].toString());
      console.log("\n  ℹ️  Off-chain next step:");
      console.log("     client.decryptForTx(encPayoutCtHash).withoutPermit().execute()");
      console.log("     → then call contract.withdraw(betId, amount, ctHash, sig)");
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log("  ✅ E2E Complete");
  console.log(`     Contract: ${contractAddress}`);
  console.log(`     Market ${marketId}: "${question}"`);
  console.log("     Bet #0 (Yes) → claimed FHE payout computation ✓");
  console.log("     Bet #1 (No)  → not claimed (loser)");
  console.log(`${"═".repeat(60)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

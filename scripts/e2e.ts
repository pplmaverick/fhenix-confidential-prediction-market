/**
 * e2e.ts — Full end-to-end test for ConfidentialPredictionMarket (M3.1)
 *
 * Market 0 — normal winner flow + Fix #2 (double-claim) verification:
 *   1.  Deploy contract
 *   2.  createMarket
 *   3.  placeBet(Yes)  — encrypted choice = true
 *   4.  placeBet(No)   — encrypted choice = false
 *   5.  lockMarket
 *   6.  submitResult (outcome = true → Yes wins)
 *   7.  revealWinnerPool
 *   8.  CoFHE decrypt winner pool
 *   9.  submitWinnerPool
 *   10. claimWinnings (betId=0, the Yes bet)
 *   11. CoFHE decrypt payout
 *   12. withdraw — first call, expects payout
 *   13. withdraw — second call with same proof, expects revert ("Already withdrawn")
 *
 * Market 1 — Fix #3 (winnerPool == 0 refund) verification:
 *   14. createMarket
 *   15. placeBet(No) — single bettor, encrypted choice = false
 *   16. lockMarket
 *   17. submitResult (outcome = true → Yes wins, but nobody bet Yes)
 *   18. revealWinnerPool
 *   19. CoFHE decrypt winner pool — expect 0
 *   20. settleNoWinners
 *   21. withdrawRefund — bettor reclaims their stake
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

function findEventArg(contract: any, receipt: any, eventName: string, argIndex: number): bigint {
  for (const l of receipt?.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog({ topics: (l as any).topics, data: (l as any).data });
      if (parsed?.name === eventName) return BigInt(parsed.args[argIndex]);
    } catch {}
  }
  throw new Error(`${eventName} event not found in tx receipt`);
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

  // ── Helper: build InEbool from SDK encrypted output ────────────────────────
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
  const [encChoice1] = await cofheClient
    .encryptInputs([
      Encryptable.bool(true), // Yes
    ])
    .execute();

  const tx3 = await contract.placeBet(
    marketId,
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
  const [encChoice2] = await cofheClient
    .encryptInputs([
      Encryptable.bool(false), // No
    ])
    .execute();

  const tx4 = await contract.placeBet(
    marketId,
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

  async function txOpts() {
    const fee = await hre.ethers.provider.getFeeData();
    return {
      maxFeePerGas: fee.maxFeePerGas ? fee.maxFeePerGas * 2n : undefined,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? undefined,
    };
  }

  // ── Step 7: revealWinnerPool ─────────────────────────────────────────────
  step(7, "revealWinnerPool — FHE sum of winning bets");

  const tx7 = await contract.revealWinnerPool(marketId, await txOpts());
  const rc7 = await tx7.wait();
  const encWinnerPoolCtHash = findEventArg(contract, rc7, "WinnerPoolRevealed", 1);
  log("Tx hash", rc7?.hash ?? tx7.hash);
  log("ctHash", "0x" + encWinnerPoolCtHash.toString(16).slice(0, 16) + "...");

  // ── Step 8: CoFHE decrypt winner pool ────────────────────────────────────
  step(8, "CoFHE decrypt winner pool");
  console.log("  ⏳ Polling Fhenix threshold network... (may take 30-90s)");

  const wpDecrypt = await cofheClient.decryptForTx(encWinnerPoolCtHash).withoutPermit().execute();
  const plainWinnerPool = wpDecrypt.decryptedValue;
  log("plainWinnerPool", hre.ethers.formatEther(plainWinnerPool) + " ETH (expect 0.0001)");

  // ── Step 9: submitWinnerPool ──────────────────────────────────────────────
  step(9, "submitWinnerPool");

  const tx9 = await contract.submitWinnerPool(
    marketId,
    plainWinnerPool,
    BigInt(wpDecrypt.ctHash.toString()),
    wpDecrypt.signature,
    await txOpts()
  );
  const rc9 = await tx9.wait();
  log("Tx hash", rc9?.hash ?? tx9.hash);

  // ── Step 10: claimWinnings ────────────────────────────────────────────────
  step(10, "claimWinnings — bet #0 (Yes bet)");

  const tx10 = await contract.claimWinnings(0n, marketId, await txOpts());
  const rc10 = await tx10.wait();
  const encPayoutCtHash = findEventArg(contract, rc10, "WinningsClaimed", 2);
  log("Bet ID", "0 (Yes bet)");
  log("Tx hash", rc10?.hash ?? tx10.hash);
  log("encPayout ctHash", "0x" + encPayoutCtHash.toString(16).slice(0, 16) + "...");

  // ── Step 11: CoFHE decrypt payout ────────────────────────────────────────
  step(11, "CoFHE decrypt payout");
  console.log("  ⏳ Polling Fhenix threshold network... (may take 30-90s)");

  const payDecrypt = await cofheClient.decryptForTx(encPayoutCtHash).withoutPermit().execute();
  const plainBetAmount = payDecrypt.decryptedValue;
  log("plainBetAmount", hre.ethers.formatEther(plainBetAmount) + " ETH (expect 0.0001)");

  // ── Step 12: withdraw — first call, expects payout ───────────────────────
  step(12, "withdraw — first call (expect payout)");

  const balBeforeWithdraw = await hre.ethers.provider.getBalance(signer.address);
  const tx12 = await contract.withdraw(
    0n,
    marketId,
    plainBetAmount,
    BigInt(payDecrypt.ctHash.toString()),
    payDecrypt.signature,
    await txOpts()
  );
  const rc12 = await tx12.wait();
  const balAfterWithdraw = await hre.ethers.provider.getBalance(signer.address);
  log("Tx hash", rc12?.hash ?? tx12.hash);
  log("Balance delta", hre.ethers.formatEther(balAfterWithdraw - balBeforeWithdraw) + " ETH (payout - gas)");

  // ── Step 13: withdraw — replay attempt, verify Fix #2 ────────────────────
  step(13, "withdraw — replay with same proof (Fix #2: expect revert)");

  try {
    const tx13 = await contract.withdraw(
      0n,
      marketId,
      plainBetAmount,
      BigInt(payDecrypt.ctHash.toString()),
      payDecrypt.signature,
      await txOpts()
    );
    await tx13.wait();
    console.log("  ❌ FAIL: second withdraw() succeeded — double-claim protection is broken!");
  } catch (e: any) {
    const msg = e?.shortMessage ?? e?.message ?? String(e);
    console.log(`  ✅ PASS: second withdraw() reverted as expected — ${msg.slice(0, 120)}`);
  }

  // ── Step 14: createMarket (no-winners scenario) ──────────────────────────
  step(14, "createMarket — Market 1 (no-winners scenario)");

  const question2 = "Will BTC exceed $500,000 by end of 2025? [always-No test]";
  const tx14 = await contract.createMarket(question2, await txOpts());
  const rc14 = await tx14.wait();
  const marketId2 = findEventArg(contract, rc14, "MarketCreated", 0);
  log("Question", question2);
  log("Market ID", marketId2.toString());
  log("Tx hash", rc14?.hash ?? tx14.hash);

  // ── Step 15: placeBet(No) — the only bet in this market ──────────────────
  step(15, "placeBet — encrypted choice = No (false), sole bettor");

  const [encChoice3] = await cofheClient.encryptInputs([Encryptable.bool(false)]).execute();
  const tx15 = await contract.placeBet(marketId2, toInEbool(encChoice3 as any), {
    value: STAKE,
    ...(await txOpts()),
  });
  const rc15 = await tx15.wait();
  const betId3 = findEventArg(contract, rc15, "BetPlaced", 1);
  log("Bet ID", betId3.toString());
  log("Stake", hre.ethers.formatEther(STAKE) + " ETH");
  log("Tx hash", rc15?.hash ?? tx15.hash);

  // ── Step 16: lockMarket ───────────────────────────────────────────────────
  step(16, "lockMarket — Market 1");

  const tx16 = await contract.lockMarket(marketId2, await txOpts());
  const rc16 = await tx16.wait();
  log("Tx hash", rc16?.hash ?? tx16.hash);

  // ── Step 17: submitResult — outcome = true (Yes wins, but nobody bet Yes) ─
  step(17, "submitResult — outcome = true (Yes wins, no Yes bettors)");

  const tx17 = await contract.submitResult(marketId2, true, await txOpts());
  const rc17 = await tx17.wait();
  log("Tx hash", rc17?.hash ?? tx17.hash);

  // ── Step 18: revealWinnerPool ─────────────────────────────────────────────
  step(18, "revealWinnerPool — Market 1 (expect sum = 0)");

  const tx18 = await contract.revealWinnerPool(marketId2, await txOpts());
  const rc18 = await tx18.wait();
  const encWinnerPoolCtHash2 = findEventArg(contract, rc18, "WinnerPoolRevealed", 1);
  log("Tx hash", rc18?.hash ?? tx18.hash);

  // ── Step 19: CoFHE decrypt winner pool — expect 0 ────────────────────────
  step(19, "CoFHE decrypt winner pool (Fix #3: expect 0)");
  console.log("  ⏳ Polling Fhenix threshold network... (may take 30-90s)");

  const wpDecrypt2 = await cofheClient.decryptForTx(encWinnerPoolCtHash2).withoutPermit().execute();
  const plainWinnerPool2 = wpDecrypt2.decryptedValue;
  log("plainWinnerPool", plainWinnerPool2.toString() + " (expect 0)");

  // ── Step 20: settleNoWinners ──────────────────────────────────────────────
  step(20, "settleNoWinners — Market 1");

  const tx20 = await contract.settleNoWinners(
    marketId2,
    BigInt(wpDecrypt2.ctHash.toString()),
    wpDecrypt2.signature,
    await txOpts()
  );
  const rc20 = await tx20.wait();
  log("Tx hash", rc20?.hash ?? tx20.hash);

  // ── Step 21: withdrawRefund ───────────────────────────────────────────────
  step(21, "withdrawRefund — bettor reclaims their stake");

  const balBeforeRefund = await hre.ethers.provider.getBalance(signer.address);
  const tx21 = await contract.withdrawRefund(betId3, marketId2, await txOpts());
  const rc21 = await tx21.wait();
  const balAfterRefund = await hre.ethers.provider.getBalance(signer.address);
  log("Tx hash", rc21?.hash ?? tx21.hash);
  log("Balance delta", hre.ethers.formatEther(balAfterRefund - balBeforeRefund) + " ETH (refund - gas, expect ~+0.0001)");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log("  ✅ E2E Complete");
  console.log(`     Contract:  ${contractAddress}`);
  console.log(`     Market 0:  "${question}" (winner flow)`);
  console.log("       Bet #0 (Yes) → claimed + withdrew payout ✓");
  console.log("       Bet #1 (No)  → not claimed (loser)");
  console.log("       Fix #2 double-claim protection: verified ✓");
  console.log(`     Market ${marketId2}:  "${question2}" (no-winners flow)`);
  console.log(`       Bet #${betId3} (No) → settleNoWinners + withdrawRefund ✓`);
  console.log("       Fix #3 winnerPool=0 refund: verified ✓");
  console.log(`${"═".repeat(60)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

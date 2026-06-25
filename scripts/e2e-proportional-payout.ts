/**
 * e2e-proportional-payout.ts
 *
 * Full end-to-end test for proportional payout flow with two wallets.
 *
 * Flow:
 *   1.  createMarket
 *   2.  Wallet A: placeBet YES (choice=true),  0.01 ETH → betId A
 *   3.  Wallet B: placeBet NO  (choice=false), 0.02 ETH → betId B
 *   4.  lockMarket  (Wallet A as owner)
 *   5.  submitResult (outcome=true → YES wins)
 *   6.  revealWinnerPool
 *   7.  CoFHE decrypt winner pool
 *   8.  submitWinnerPool
 *   9.  Wallet A: claimWinnings (betId A)
 *   10. CoFHE decrypt payout
 *   11. withdraw
 *
 * Expected payout: 0.01 × 0.03 / 0.01 = 0.03 ETH (minus gas)
 *
 * Run:
 *   npx hardhat run scripts/e2e-proportional-payout.ts --network arbitrumSepolia
 */

import hre from "hardhat";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/node";
import { arbSepolia } from "@cofhe/sdk/chains";
import { Encryptable } from "@cofhe/sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia as viemArbSepolia } from "viem/chains";

const CONTRACT_ADDRESS = "0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB";

function step(n: number, title: string) {
  console.log(`\n${"─".repeat(62)}`);
  console.log(`  Step ${n}: ${title}`);
  console.log("─".repeat(62));
}

function log(label: string, value: string) {
  console.log(`  ${label.padEnd(24)}: ${value}`);
}

function toInEuint64(enc: any) {
  return { ctHash: enc.ctHash, securityZone: enc.securityZone, utype: enc.utype, signature: enc.signature };
}

function toInEbool(enc: any) {
  return { ctHash: enc.ctHash, securityZone: enc.securityZone, utype: enc.utype, signature: enc.signature };
}

async function main() {
  console.log("\n🔐 Fhenix CPM — Proportional Payout E2E Test");
  console.log("   Network : Arbitrum Sepolia (chainId 421614)");
  console.log("   Contract:", CONTRACT_ADDRESS);

  const RPC =
    process.env.ARBITRUM_SEPOLIA_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";

  // ── Keys & signers ─────────────────────────────────────────────────────────
  const pk1 = process.env.PRIVATE_KEY;
  const pk2 = process.env.PRIVATE_KEY_2;
  if (!pk1) throw new Error("PRIVATE_KEY not set in .env");
  if (!pk2) throw new Error("PRIVATE_KEY_2 not set in .env");

  // pk1 has no 0x prefix; pk2 already has 0x prefix
  const signerA = new hre.ethers.Wallet(`0x${pk1}`, hre.ethers.provider);
  const signerB = new hre.ethers.Wallet(pk2, hre.ethers.provider);

  log("Wallet A", signerA.address);
  log("Wallet B", signerB.address);

  const balBefore = await hre.ethers.provider.getBalance(signerA.address);
  log("Wallet A balance (before)", hre.ethers.formatEther(balBefore) + " ETH");

  // ── Contract instances ─────────────────────────────────────────────────────
  const contractA = await hre.ethers.getContractAt(
    "ConfidentialPredictionMarket",
    CONTRACT_ADDRESS,
    signerA
  );
  const contractB = contractA.connect(signerB);

  // ── CoFHE clients ──────────────────────────────────────────────────────────
  console.log("\n  Initialising CoFHE clients...");

  const publicClient = createPublicClient({
    chain: viemArbSepolia,
    transport: http(RPC),
  });

  const accountA = privateKeyToAccount(`0x${pk1}`);
  const accountB = privateKeyToAccount(pk2 as `0x${string}`);

  const walletClientA = createWalletClient({
    chain: viemArbSepolia,
    transport: http(RPC),
    account: accountA,
  });
  const walletClientB = createWalletClient({
    chain: viemArbSepolia,
    transport: http(RPC),
    account: accountB,
  });

  const cofheConfig = createCofheConfig({ supportedChains: [arbSepolia] });

  const cofheClientA = createCofheClient(cofheConfig);
  await cofheClientA.connect(publicClient, walletClientA);
  await cofheClientA.permits.getOrCreateSelfPermit();

  const cofheClientB = createCofheClient(cofheConfig);
  await cofheClientB.connect(publicClient, walletClientB);
  await cofheClientB.permits.getOrCreateSelfPermit();

  console.log("  ✅ CoFHE clients ready");

  // ── Gas helper ─────────────────────────────────────────────────────────────
  async function txOpts() {
    const fee = await hre.ethers.provider.getFeeData();
    return {
      maxFeePerGas: fee.maxFeePerGas ? fee.maxFeePerGas * 2n : undefined,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? undefined,
    };
  }

  // ── Step 1: createMarket ───────────────────────────────────────────────────
  step(1, "createMarket");

  const question = "Will ETH exceed $5000 in 2025? [e2e proportional payout test]";
  const tx1 = await contractA.createMarket(question, await txOpts());
  const rc1 = await tx1.wait();

  let marketId = 0n;
  for (const l of rc1?.logs ?? []) {
    try {
      const p = contractA.interface.parseLog({
        topics: (l as any).topics,
        data: (l as any).data,
      });
      if (p?.name === "MarketCreated") {
        marketId = BigInt(p.args[0]);
        break;
      }
    } catch {}
  }

  log("Question", question);
  log("Market ID", marketId.toString());
  log("Tx hash", rc1?.hash ?? tx1.hash);

  // ── Step 2: placeBet A — YES (true), 0.01 ETH ─────────────────────────────
  step(2, "placeBet A — YES (true), 0.01 ETH");

  const STAKE_A = hre.ethers.parseEther("0.01");
  console.log("  Encrypting inputs via CoFHE...");
  const [encAmtA, encChoA] = await cofheClientA
    .encryptInputs([
      Encryptable.uint64(STAKE_A),
      Encryptable.bool(true), // YES
    ])
    .execute();

  const tx2 = await contractA.placeBet(
    marketId,
    toInEuint64(encAmtA),
    toInEbool(encChoA),
    { ...(await txOpts()), value: STAKE_A }
  );
  const rc2 = await tx2.wait();

  let betIdA = 0n;
  for (const l of rc2?.logs ?? []) {
    try {
      const p = contractA.interface.parseLog({
        topics: (l as any).topics,
        data: (l as any).data,
      });
      if (p?.name === "BetPlaced") {
        betIdA = BigInt(p.args[1]);
        break;
      }
    } catch {}
  }

  log("Bet ID A", betIdA.toString());
  log("Choice", "true = YES");
  log("Stake", "0.01 ETH");
  log("Tx hash", rc2?.hash ?? tx2.hash);

  // ── Step 3: placeBet B — NO (false), 0.02 ETH ─────────────────────────────
  step(3, "placeBet B — NO (false), 0.02 ETH");

  const STAKE_B = hre.ethers.parseEther("0.02");
  console.log("  Encrypting inputs via CoFHE...");
  const [encAmtB, encChoB] = await cofheClientB
    .encryptInputs([
      Encryptable.uint64(STAKE_B),
      Encryptable.bool(false), // NO
    ])
    .execute();

  const tx3 = await contractB.placeBet(
    marketId,
    toInEuint64(encAmtB),
    toInEbool(encChoB),
    { ...(await txOpts()), value: STAKE_B }
  );
  const rc3 = await tx3.wait();

  let betIdB = 1n;
  for (const l of rc3?.logs ?? []) {
    try {
      const p = contractA.interface.parseLog({
        topics: (l as any).topics,
        data: (l as any).data,
      });
      if (p?.name === "BetPlaced") {
        betIdB = BigInt(p.args[1]);
        break;
      }
    } catch {}
  }

  log("Bet ID B", betIdB.toString());
  log("Choice", "false = NO");
  log("Stake", "0.02 ETH");
  log("Tx hash", rc3?.hash ?? tx3.hash);

  // Verify total pool
  const mktAfterBets = await contractA.markets(marketId);
  log("Total pool", hre.ethers.formatEther(mktAfterBets.totalPool) + " ETH (expect 0.03)");

  // ── Step 4: lockMarket ─────────────────────────────────────────────────────
  step(4, "lockMarket");

  const tx4 = await contractA.lockMarket(marketId, await txOpts());
  const rc4 = await tx4.wait();
  log("Tx hash", rc4?.hash ?? tx4.hash);

  // ── Step 5: submitResult (YES wins) ───────────────────────────────────────
  step(5, "submitResult — outcome = true (YES wins)");

  const tx5 = await contractA.submitResult(marketId, true, await txOpts());
  const rc5 = await tx5.wait();
  log("Outcome", "true = YES wins");
  log("Tx hash", rc5?.hash ?? tx5.hash);

  // ── Step 6: revealWinnerPool ───────────────────────────────────────────────
  step(6, "revealWinnerPool — FHE sum of winning bets");

  const tx6 = await contractA.revealWinnerPool(marketId, await txOpts());
  const rc6 = await tx6.wait();
  log("Tx hash", rc6?.hash ?? tx6.hash);

  let encWinnerPoolCtHash = 0n;
  for (const l of rc6?.logs ?? []) {
    try {
      const p = contractA.interface.parseLog({
        topics: (l as any).topics,
        data: (l as any).data,
      });
      if (p?.name === "WinnerPoolRevealed") {
        encWinnerPoolCtHash = BigInt(p.args[1]);
        break;
      }
    } catch {}
  }
  if (encWinnerPoolCtHash === 0n) throw new Error("WinnerPoolRevealed event not found in tx receipt");
  log("encWinnerPool ctHash", "0x" + encWinnerPoolCtHash.toString(16).slice(0, 16) + "...");

  // ── Step 7: CoFHE decrypt winner pool ─────────────────────────────────────
  step(7, "CoFHE decrypt winner pool");
  console.log("  ⏳ Polling Fhenix threshold network... (may take 30-90s)");

  const wpDecrypt = await cofheClientA
    .decryptForTx(encWinnerPoolCtHash)
    .withoutPermit()
    .execute();

  const plainWinnerPool = wpDecrypt.decryptedValue;
  log("plainWinnerPool", hre.ethers.formatEther(plainWinnerPool) + " ETH");
  log("Expected", "0.01 ETH (only Wallet A's YES bet)");

  // ── Step 8: submitWinnerPool ───────────────────────────────────────────────
  step(8, "submitWinnerPool");

  const tx8 = await contractA.submitWinnerPool(
    marketId,
    plainWinnerPool,
    BigInt(wpDecrypt.ctHash.toString()),
    wpDecrypt.signature,
    await txOpts()
  );
  const rc8 = await tx8.wait();
  log("plainWinnerPool", hre.ethers.formatEther(plainWinnerPool) + " ETH");
  log("Tx hash", rc8?.hash ?? tx8.hash);

  // ── Step 9: claimWinnings — Wallet A ──────────────────────────────────────
  step(9, `claimWinnings — Wallet A, betId=${betIdA}`);

  const tx9 = await contractA.claimWinnings(betIdA, marketId, await txOpts());
  const rc9 = await tx9.wait();
  log("Tx hash", rc9?.hash ?? tx9.hash);

  let encPayoutCtHash = 0n;
  for (const l of rc9?.logs ?? []) {
    try {
      const p = contractA.interface.parseLog({
        topics: (l as any).topics,
        data: (l as any).data,
      });
      if (p?.name === "WinningsClaimed") {
        encPayoutCtHash = BigInt(p.args[2]);
        break;
      }
    } catch {}
  }
  if (encPayoutCtHash === 0n) throw new Error("WinningsClaimed event not found in tx receipt");
  log("encPayout ctHash", "0x" + encPayoutCtHash.toString(16).slice(0, 16) + "...");

  // ── Step 10: CoFHE decrypt payout ─────────────────────────────────────────
  step(10, "CoFHE decrypt payout (Wallet A's bet amount)");
  console.log("  ⏳ Polling Fhenix threshold network... (may take 30-90s)");

  const payDecrypt = await cofheClientA
    .decryptForTx(encPayoutCtHash)
    .withoutPermit()
    .execute();

  const plainBetAmount = payDecrypt.decryptedValue;
  log("plainBetAmount", hre.ethers.formatEther(plainBetAmount) + " ETH");
  log("Expected", "0.01 ETH (Wallet A is winner → gets their stake amount)");

  // Client-side proportional payout estimate (same formula as contract)
  const mktFinal = await contractA.markets(marketId);
  const totalPool = mktFinal.totalPool;
  const expectedPayout = (plainBetAmount * totalPool) / plainWinnerPool;
  log("totalPool", hre.ethers.formatEther(totalPool) + " ETH");
  log("winnerPool", hre.ethers.formatEther(plainWinnerPool) + " ETH");
  log("Expected payout", hre.ethers.formatEther(expectedPayout) + " ETH (pre-gas)");

  // ── Step 11: withdraw ──────────────────────────────────────────────────────
  step(11, "withdraw — Wallet A receives proportional payout");

  const tx11 = await contractA.withdraw(
    betIdA,
    marketId,
    plainBetAmount,
    BigInt(payDecrypt.ctHash.toString()),
    payDecrypt.signature,
    await txOpts()
  );
  const rc11 = await tx11.wait();
  log("Tx hash", rc11?.hash ?? tx11.hash);

  // ── Summary ────────────────────────────────────────────────────────────────
  const balAfter = await hre.ethers.provider.getBalance(signerA.address);
  const delta = balAfter - balBefore;

  console.log(`\n${"═".repeat(62)}`);
  console.log("  ✅ E2E Proportional Payout Test Complete");
  console.log(`     Contract:         ${CONTRACT_ADDRESS}`);
  console.log(`     Market ID:        ${marketId}`);
  console.log(`     Wallet A:         ${signerA.address}`);
  console.log(`     Wallet B:         ${signerB.address}`);
  console.log(`     Wallet A before:  ${hre.ethers.formatEther(balBefore)} ETH`);
  console.log(`     Wallet A after:   ${hre.ethers.formatEther(balAfter)} ETH`);
  console.log(`     Net delta:        ${hre.ethers.formatEther(delta)} ETH (payout - gas)`);
  console.log(`     Payout formula:   0.01 × 0.03 / 0.01 = 0.03 ETH`);
  console.log(`     Wallet B (loser): no claim (NO bet lost, stake stays in pool)`);
  console.log(`${"═".repeat(62)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

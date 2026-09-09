import hre from "hardhat";

// Defaults target the M3.1 contract this tool was first written for. Override with
// CONTRACT_ADDRESS / DEPLOY_TX_HASH / MARKET_IDS (comma-separated) to scan another
// deployment — DEPLOY_TX_HASH sets the block floor for the eth_getLogs scan.
const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS ?? "0x9DE6ba0f6901e366BbCf373F7c8F63b5c955138d";
const DEPLOY_TX_HASH =
  process.env.DEPLOY_TX_HASH ?? "0x675323436baa15e2ea34bca599880d30f1e91ddd8db7e1851afd9ce98d9cf597";
const MARKET_IDS = process.env.MARKET_IDS
  ? process.env.MARKET_IDS.split(",").map((s) => Number(s.trim()))
  : [2, 3, 4, 5, 6];
const LOG_RANGE = 10_000; // public Arbitrum Sepolia RPC caps eth_getLogs block ranges

const ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: true, internalType: "uint256", name: "betId", type: "uint256" },
      { indexed: true, internalType: "address", name: "bettor", type: "address" },
    ],
    name: "BetPlaced",
    type: "event",
  },
] as const;

async function main() {
  const provider = hre.ethers.provider;
  const contract = new hre.ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  const deployReceipt = await provider.getTransactionReceipt(DEPLOY_TX_HASH);
  if (!deployReceipt) throw new Error("Could not find deploy tx receipt");
  const fromBlockFloor = deployReceipt.blockNumber;
  const latestBlock = await provider.getBlockNumber();

  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`Scanning blocks ${fromBlockFloor} → ${latestBlock} in chunks of ${LOG_RANGE}\n`);

  const filter = contract.filters.BetPlaced(
    MARKET_IDS.map((id) => BigInt(id))
  );

  const allEvents: any[] = [];
  for (let start = fromBlockFloor; start <= latestBlock; start += LOG_RANGE) {
    const end = Math.min(start + LOG_RANGE - 1, latestBlock);
    const events = await contract.queryFilter(filter, start, end);
    allEvents.push(...events);
  }

  const byMarket = new Map<number, any[]>();
  for (const id of MARKET_IDS) byMarket.set(id, []);
  for (const ev of allEvents) {
    const marketId = Number((ev as any).args.marketId);
    byMarket.get(marketId)?.push(ev);
  }

  const DEV_WALLET = "0xed2B5717c9b936ecC76d75401026A99143e278F5".toLowerCase();
  const nonDevBettors = new Set<string>();

  for (const id of MARKET_IDS) {
    const events = byMarket.get(id) ?? [];
    console.log(`Market #${id} — ${events.length} bet(s)`);
    if (events.length === 0) {
      console.log("  (no bets placed)\n");
      continue;
    }
    for (const ev of events) {
      const betId = (ev as any).args.betId.toString();
      const bettor = (ev as any).args.bettor as string;
      const isDev = bettor.toLowerCase() === DEV_WALLET;
      if (!isDev) nonDevBettors.add(bettor);
      console.log(
        `  betId=${betId.padEnd(3)} bettor=${bettor} ${isDev ? "(dev wallet)" : "⚠️  NON-DEV ADDRESS"}  tx=${ev.transactionHash}`
      );
    }
    console.log("");
  }

  console.log("─".repeat(70));
  if (nonDevBettors.size === 0) {
    const scanned = MARKET_IDS.map((id) => `#${id}`).join(", ");
    console.log(`✅ All bets across markets ${scanned} were placed by the dev wallet.`);
  } else {
    console.log(`⚠️  ${nonDevBettors.size} non-dev address(es) found — real user funds present:`);
    for (const addr of nonDevBettors) console.log(`   ${addr}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

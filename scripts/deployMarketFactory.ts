import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;

  console.log("Deploying MarketFactory...");
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    hre.ethers.formatEther(await provider.getBalance(deployer.address)),
    "ETH"
  );
  console.log(
    "Network:",
    hre.network.name,
    "(chainId:",
    (await provider.getNetwork()).chainId.toString() + ")"
  );

  const feeData = await provider.getFeeData();
  console.log(
    "maxFeePerGas:",
    feeData.maxFeePerGas ? hre.ethers.formatUnits(feeData.maxFeePerGas, "gwei") + " gwei" : "n/a"
  );

  const Factory = await hre.ethers.getContractFactory("MarketFactory");
  const factory = await Factory.deploy({
    maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 2n : undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  });
  await factory.waitForDeployment();

  const address = await factory.getAddress();
  const deployTx = factory.deploymentTransaction();

  console.log("\n✅ MarketFactory deployed at:", address);
  console.log("   Tx hash:   ", deployTx?.hash);

  const deployFile = path.join(__dirname, "../deployments/addresses.json");
  const deployments: Record<string, Record<string, string>> = {};
  if (fs.existsSync(deployFile)) {
    Object.assign(deployments, JSON.parse(fs.readFileSync(deployFile, "utf8")));
  }
  if (!deployments[hre.network.name]) {
    deployments[hre.network.name] = {};
  }
  deployments[hre.network.name].MarketFactory = address;
  fs.mkdirSync(path.dirname(deployFile), { recursive: true });
  fs.writeFileSync(deployFile, JSON.stringify(deployments, null, 2));
  console.log("   Address saved to deployments/addresses.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

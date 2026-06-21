import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying ConfidentialPredictionMarket...");
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)),
    "ETH"
  );
  console.log("Network:", hre.network.name, "(chainId:", (await hre.ethers.provider.getNetwork()).chainId.toString() + ")");

  const Factory = await hre.ethers.getContractFactory("ConfidentialPredictionMarket");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  console.log("\n✅ Deployed at:", address);
  console.log("   Tx hash:   ", deployTx?.hash);

  // Save address for e2e script
  const deployments: Record<string, string> = {};
  const deployFile = path.join(__dirname, "../deployments/addresses.json");
  if (fs.existsSync(deployFile)) {
    Object.assign(deployments, JSON.parse(fs.readFileSync(deployFile, "utf8")));
  }
  deployments[hre.network.name] = address;
  fs.mkdirSync(path.dirname(deployFile), { recursive: true });
  fs.writeFileSync(deployFile, JSON.stringify(deployments, null, 2));
  console.log("   Address saved to deployments/addresses.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

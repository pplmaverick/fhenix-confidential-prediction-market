/**
 * Requires a running local Hardhat JSON-RPC node (mocks auto-deploy on startup):
 *   Terminal 1: npm run test:node   (or: npx hardhat node)
 *   Terminal 2: npm test            (or: npx hardhat test --network localhost)
 *
 * The plain in-process `hardhat` network (bare `npx hardhat test`) is NOT
 * sufficient for the placeBet/getBetsByAddress/full-lifecycle tests below:
 * @cofhe/sdk's mock ZK-verify-sign step makes a real HTTP call to
 * 127.0.0.1:8545 from its own dedicated verifier signer, which only exists
 * once an actual `hardhat node` process is listening there. The permission/
 * lifecycle tests that don't touch FHE encryption pass on either network.
 */
import hre from "hardhat";
import { expect } from "chai";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/node";
import { hardhat as cofheHardhatChain } from "@cofhe/sdk/chains";
import { Encryptable } from "@cofhe/sdk";
import { HardhatSignerAdapter } from "@cofhe/sdk/adapters";

// ── CoFHE mock helpers ──────────────────────────────────────────────────────
// Local Hardhat network runs with CoFHE mock contracts (auto-deployed by
// @cofhe/hardhat-plugin). Pointing the SDK client at the `hardhat` chain
// preset (environment: 'MOCK') routes encrypt/decrypt through those mocks
// instead of the real off-chain threshold network, so tests run instantly
// with no external dependency.

async function makeCofheClient(signer: HardhatEthersSigner) {
  const config = createCofheConfig({ supportedChains: [cofheHardhatChain] });
  const client = createCofheClient(config);
  const { publicClient, walletClient } = await HardhatSignerAdapter(signer);
  await client.connect(publicClient, walletClient);
  await client.permits.getOrCreateSelfPermit();
  return client;
}

function toInEbool(enc: { ctHash: bigint; securityZone: number; utype: number; signature: string }) {
  return {
    ctHash: enc.ctHash,
    securityZone: enc.securityZone,
    utype: enc.utype,
    signature: enc.signature,
  };
}

function findEventArg(contract: any, receipt: any, eventName: string, argIndex: number): bigint {
  for (const l of receipt?.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog({ topics: l.topics, data: l.data });
      if (parsed?.name === eventName) return BigInt(parsed.args[argIndex]);
    } catch {
      // not this event's log — ignore
    }
  }
  throw new Error(`${eventName} event not found in tx receipt`);
}

describe("ConfidentialPredictionMarket", function () {
  this.timeout(120000);

  async function deployFixture() {
    const [owner, other, bettorYes, bettorNo] = await hre.ethers.getSigners();
    const Factory = await hre.ethers.getContractFactory("ConfidentialPredictionMarket");
    const contract = await Factory.deploy();
    await contract.waitForDeployment();
    return { contract, owner, other, bettorYes, bettorNo };
  }

  describe("createMarket — permissionless", () => {
    it("allows any address (not just a privileged one) to create a market", async () => {
      const { contract, other } = await deployFixture();
      await expect(contract.connect(other).createMarket("Will it rain tomorrow?"))
        .to.emit(contract, "MarketCreated")
        .withArgs(0n, "Will it rain tomorrow?", other.address);

      const info = await contract.getMarketInfo(0);
      expect(info.owner).to.equal(other.address);
    });
  });

  describe("lockMarket — owner-restricted", () => {
    it("reverts when called by an address that is not the market owner", async () => {
      const { contract, owner, other } = await deployFixture();
      await contract.connect(owner).createMarket("Q");
      await expect(contract.connect(other).lockMarket(0)).to.be.revertedWith("Not market owner");
    });

    it("succeeds when called by the market owner", async () => {
      const { contract, owner } = await deployFixture();
      await contract.connect(owner).createMarket("Q");
      await expect(contract.connect(owner).lockMarket(0)).to.emit(contract, "MarketLocked").withArgs(0n);
    });
  });

  describe("submitResult — lifecycle ordering", () => {
    it("reverts if the market has not been locked yet", async () => {
      const { contract, owner } = await deployFixture();
      await contract.connect(owner).createMarket("Q");
      await expect(contract.connect(owner).submitResult(0, true)).to.be.revertedWith(
        "Market must be locked first"
      );
    });

    it("reverts on a second submitResult call (already resolved)", async () => {
      const { contract, owner } = await deployFixture();
      await contract.connect(owner).createMarket("Q");
      await contract.connect(owner).lockMarket(0);
      await contract.connect(owner).submitResult(0, true);
      await expect(contract.connect(owner).submitResult(0, false)).to.be.revertedWith("Already resolved");
    });
  });

  describe("getMarketInfo", () => {
    it("returns all fields matching what was set at createMarket time", async () => {
      const { contract, owner } = await deployFixture();
      await contract.connect(owner).createMarket("Question X");

      const info = await contract.getMarketInfo(0);
      expect(info.question).to.equal("Question X");
      expect(info.owner).to.equal(owner.address);
      expect(info.locked).to.equal(false);
      expect(info.resolved).to.equal(false);
      expect(info.totalPool).to.equal(0n);
    });
  });

  describe("placeBet — boundary case", () => {
    it("reverts on a zero-value bet", async () => {
      const { contract, owner, bettorYes } = await deployFixture();
      await contract.connect(owner).createMarket("Q");

      const client = await makeCofheClient(bettorYes);
      const [encChoice] = await client.encryptInputs([Encryptable.bool(true)]).execute();

      await expect(
        contract.connect(bettorYes).placeBet(0, toInEbool(encChoice as any), { value: 0 })
      ).to.be.revertedWith("Must send ETH as stake");
    });
  });

  describe("getBetsByAddress", () => {
    it("returns only the bet ids placed by the given address", async () => {
      const { contract, owner, bettorYes, bettorNo } = await deployFixture();
      await contract.connect(owner).createMarket("Q");

      const clientYes = await makeCofheClient(bettorYes);
      const clientNo = await makeCofheClient(bettorNo);

      const [encYes] = await clientYes.encryptInputs([Encryptable.bool(true)]).execute();
      await contract
        .connect(bettorYes)
        .placeBet(0, toInEbool(encYes as any), { value: hre.ethers.parseEther("0.001") });

      const [encNo] = await clientNo.encryptInputs([Encryptable.bool(false)]).execute();
      await contract
        .connect(bettorNo)
        .placeBet(0, toInEbool(encNo as any), { value: hre.ethers.parseEther("0.002") });

      const yesBets = await contract.getBetsByAddress(bettorYes.address);
      const noBets = await contract.getBetsByAddress(bettorNo.address);
      const ownerBets = await contract.getBetsByAddress(owner.address);

      expect(yesBets.map((b: bigint) => b.toString())).to.deep.equal(["0"]);
      expect(noBets.map((b: bigint) => b.toString())).to.deep.equal(["1"]);
      expect(ownerBets.length).to.equal(0);
    });
  });

  describe("full lifecycle — placeBet → lock → resolve → claimWinnings → withdraw", () => {
    it("pays the sole winning bettor the entire pool", async () => {
      const { contract, owner, bettorYes, bettorNo } = await deployFixture();
      await contract.connect(owner).createMarket("Q");

      const clientYes = await makeCofheClient(bettorYes);
      const clientNo = await makeCofheClient(bettorNo);
      const STAKE = hre.ethers.parseEther("0.0001");

      const [encYes] = await clientYes.encryptInputs([Encryptable.bool(true)]).execute();
      await contract.connect(bettorYes).placeBet(0, toInEbool(encYes as any), { value: STAKE });

      const [encNo] = await clientNo.encryptInputs([Encryptable.bool(false)]).execute();
      await contract.connect(bettorNo).placeBet(0, toInEbool(encNo as any), { value: STAKE });

      await contract.connect(owner).lockMarket(0);
      await contract.connect(owner).submitResult(0, true); // Yes wins

      const revealRc = await (await contract.revealWinnerPool(0)).wait();
      const encWinnerPoolCtHash = findEventArg(contract, revealRc, "WinnerPoolRevealed", 1);

      const wpDecrypt = await clientYes.decryptForTx(encWinnerPoolCtHash).withoutPermit().execute();
      await contract.submitWinnerPool(
        0,
        wpDecrypt.decryptedValue,
        BigInt(wpDecrypt.ctHash.toString()),
        wpDecrypt.signature
      );

      const claimRc = await (await contract.connect(bettorYes).claimWinnings(0, 0)).wait();
      const encPayoutCtHash = findEventArg(contract, claimRc, "WinningsClaimed", 2);

      const payDecrypt = await clientYes.decryptForTx(encPayoutCtHash).withoutPermit().execute();

      const balBefore = await hre.ethers.provider.getBalance(bettorYes.address);
      const withdrawTx = await contract
        .connect(bettorYes)
        .withdraw(0, 0, payDecrypt.decryptedValue, BigInt(payDecrypt.ctHash.toString()), payDecrypt.signature);
      const withdrawRc = await withdrawTx.wait();
      const gasCost = withdrawRc!.gasUsed * withdrawRc!.gasPrice;
      const balAfter = await hre.ethers.provider.getBalance(bettorYes.address);

      // Sole Yes bettor wins the entire pool (both stakes), proportional payout
      // collapses to "gets everything" when there's only one winning bet.
      expect(balAfter - balBefore + gasCost).to.equal(STAKE * 2n);
    });
  });
});

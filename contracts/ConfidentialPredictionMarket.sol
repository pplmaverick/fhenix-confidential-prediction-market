// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    FHE,
    euint64,
    ebool,
    InEuint64,
    InEbool
} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

/**
 * @title ConfidentialPredictionMarket
 * @notice FHE-based prediction market where bet choices remain encrypted until reveal
 *
 * Flow:
 *   createMarket → placeBet(encrypted choice + amount) → lockMarket
 *   → submitResult → revealWinnerPool → [off-chain decrypt] → submitWinnerPool
 *   → claimWinnings (FHE computation) → [off-chain decrypt] → withdraw (proportional payout)
 *
 * Privacy: bet choices are encrypted on-chain via CoFHE; only the bettor can
 * decrypt their own choice via FHE.allowSender permission.
 *
 * Proportional payout: winners split the entire pool proportionally to their stake.
 *   payout = (betAmount × totalPool) / winnerPool  (multiply first to preserve precision)
 */
contract ConfidentialPredictionMarket {
    // ─── Data Structures ───────────────────────────────────────────────────────

    struct Market {
        string question;
        address owner;
        bool locked;
        bool resolved;
        bool outcome;     // true = Yes wins, false = No wins (revealed at resolve)
        uint256 totalPool;
    }

    struct Bet {
        euint64 encAmount; // encrypted bet amount
        ebool   encChoice; // encrypted choice: true = Yes, false = No
        uint256 plainAmount; // msg.value for ETH accounting
        address bettor;
        bool    claimed;
    }

    // ─── State ──────────────────────────────────────────────────────────────────

    uint256 public nextMarketId;
    uint256 public nextBetId;

    mapping(uint256 => Market)    public markets;
    mapping(uint256 => Bet)       public bets;        // betId → Bet
    mapping(uint256 => uint256[]) public marketBets;  // marketId → betIds

    // Encrypted payout ctHash stored after claimWinnings, for off-chain decryption
    mapping(uint256 => euint64) public pendingPayouts; // betId → encPayout (bettor's amount if winner, 0 if loser)

    // Winner pool: encrypted ctHash stored after revealWinnerPool, plaintext after submitWinnerPool
    mapping(uint256 => euint64)  public encWinnerPools; // marketId → encrypted winner pool
    mapping(uint256 => uint256)  public winnerPools;    // marketId → plaintext winner pool (wei)

    // ─── Events ─────────────────────────────────────────────────────────────────

    event MarketCreated(uint256 indexed marketId, string question, address owner);
    event BetPlaced(uint256 indexed marketId, uint256 indexed betId, address indexed bettor);
    event MarketLocked(uint256 indexed marketId);
    event ResultSubmitted(uint256 indexed marketId, bool outcome);
    event WinnerPoolRevealed(uint256 indexed marketId, bytes32 encWinnerPoolCtHash);
    event WinnerPoolSet(uint256 indexed marketId, uint256 plainWinnerPool);
    event WinningsClaimed(uint256 indexed betId, address indexed bettor, bytes32 encPayoutCtHash);

    // ─── Actions ────────────────────────────────────────────────────────────────

    function createMarket(string calldata question) external returns (uint256 marketId) {
        marketId = nextMarketId++;
        markets[marketId] = Market({
            question: question,
            owner: msg.sender,
            locked: false,
            resolved: false,
            outcome: false,
            totalPool: 0
        });
        emit MarketCreated(marketId, question, msg.sender);
    }

    function createMarketFor(string calldata question, address owner) external returns (uint256 marketId) {
        marketId = nextMarketId++;
        markets[marketId] = Market({
            question: question,
            owner: owner,
            locked: false,
            resolved: false,
            outcome: false,
            totalPool: 0
        });
        emit MarketCreated(marketId, question, owner);
    }

    /**
     * @notice Place a bet with encrypted choice and encrypted amount.
     * @param marketId  Target market.
     * @param encAmount FHE-encrypted bet amount (must match msg.value semantically).
     * @param encChoice FHE-encrypted choice: encrypt(true) = Yes, encrypt(false) = No.
     */
    function placeBet(
        uint256 marketId,
        InEuint64 calldata encAmount,
        InEbool   calldata encChoice
    ) external payable returns (uint256 betId) {
        Market storage market = markets[marketId];
        require(!market.locked, "Market is locked");
        require(msg.value > 0, "Must send ETH as stake");

        // Convert encrypted inputs to FHE ciphertexts
        euint64 amount = FHE.asEuint64(encAmount);
        ebool   choice = FHE.asEbool(encChoice);

        // ACL: grant this contract future access to the ciphertexts
        FHE.allowThis(amount);
        FHE.allowThis(choice);
        // ACL: grant the bettor access to view/decrypt their own values
        FHE.allowSender(amount);
        FHE.allowSender(choice);

        betId = nextBetId++;
        bets[betId] = Bet({
            encAmount:   amount,
            encChoice:   choice,
            plainAmount: msg.value,
            bettor:      msg.sender,
            claimed:     false
        });
        marketBets[marketId].push(betId);
        market.totalPool += msg.value;

        emit BetPlaced(marketId, betId, msg.sender);
    }

    function lockMarket(uint256 marketId) external {
        Market storage market = markets[marketId];
        require(msg.sender == market.owner, "Not market owner");
        require(!market.locked, "Already locked");
        market.locked = true;
        emit MarketLocked(marketId);
    }

    function submitResult(uint256 marketId, bool outcome) external {
        Market storage market = markets[marketId];
        require(msg.sender == market.owner, "Not market owner");
        require(market.locked, "Market must be locked first");
        require(!market.resolved, "Already resolved");
        market.resolved = true;
        market.outcome  = outcome;
        emit ResultSubmitted(marketId, outcome);
    }

    /**
     * @notice Compute the encrypted sum of all winning bets' amounts via FHE.
     *         Anyone can call this after submitResult.
     *         After calling, decrypt the ctHash off-chain and call submitWinnerPool().
     */
    function revealWinnerPool(uint256 marketId) external {
        Market storage market = markets[marketId];
        require(market.resolved, "Market not resolved");
        require(euint64.unwrap(encWinnerPools[marketId]) == bytes32(0), "Already revealed");

        ebool outcomeEnc = FHE.asEbool(market.outcome);

        // FHE sum of all winning bets' encrypted amounts
        euint64 winnerSum = FHE.asEuint64(0);
        uint256[] storage betIds = marketBets[marketId];
        for (uint256 i = 0; i < betIds.length; i++) {
            Bet storage bet = bets[betIds[i]];
            ebool isWinner = FHE.eq(bet.encChoice, outcomeEnc);
            euint64 contribution = FHE.select(isWinner, bet.encAmount, FHE.asEuint64(0));
            winnerSum = FHE.add(winnerSum, contribution);
        }

        // Allow threshold network to decrypt the sum
        FHE.allowPublic(winnerSum);
        encWinnerPools[marketId] = winnerSum;
        emit WinnerPoolRevealed(marketId, euint64.unwrap(winnerSum));
    }

    /**
     * @notice Store the decrypted winner pool after off-chain CoFHE decryption.
     *         Call with (plainWinnerPool, ctHash, signature) obtained from decryptForTx().
     */
    function submitWinnerPool(
        uint256 marketId,
        uint256 plainWinnerPool,
        uint256 ctHash,
        bytes calldata signature
    ) external {
        require(winnerPools[marketId] == 0, "Winner pool already set");
        FHE.publishDecryptResult(ctHash, plainWinnerPool, signature);
        winnerPools[marketId] = plainWinnerPool;
        emit WinnerPoolSet(marketId, plainWinnerPool);
    }

    /**
     * @notice FHE-based winner check.
     *         Encrypts whether the bettor won; stores the encrypted bet amount (or 0).
     *         The proportional payout is computed in plaintext in withdraw().
     *
     * Requires winner pool to be revealed first via revealWinnerPool → submitWinnerPool.
     *
     * Withdraw flow (after FHE coprocessor processes):
     *   1. Call claimWinnings → stores encPayout (encAmount if winner, 0 if loser)
     *   2. Off-chain: client.decryptForTx(encPayoutCtHash) → (plainBetAmount, ctHash, sig)
     *   3. On-chain: withdraw(betId, marketId, plainBetAmount, ctHash, sig)
     *      → payout = (plainBetAmount × totalPool) / winnerPool
     */
    function claimWinnings(uint256 betId, uint256 marketId) external {
        Market storage market = markets[marketId];
        require(market.resolved, "Market not resolved yet");
        require(winnerPools[marketId] > 0, "Winner pool not set - call revealWinnerPool first");

        Bet storage bet = bets[betId];
        require(bet.bettor == msg.sender, "Not your bet");
        require(!bet.claimed, "Already claimed");

        // ── FHE Winner Verification ──────────────────────────────────────────
        // 1. Encrypt the plaintext outcome to compare against encrypted choice
        ebool outcomeEnc = FHE.asEbool(market.outcome);

        // 2. Compare encrypted choice vs encrypted outcome (result is encrypted)
        ebool isWinner = FHE.eq(bet.encChoice, outcomeEnc);

        // 3. Winner gets their encrypted bet amount; loser gets 0
        //    The proportional scaling (× totalPool / winnerPool) is done in plaintext in withdraw()
        euint64 encPayout = FHE.select(isWinner, bet.encAmount, FHE.asEuint64(0));

        // 4. Allow public decryption (anyone can request decrypt via threshold network)
        FHE.allowPublic(encPayout);
        // 5. Also allow the bettor directly
        FHE.allowSender(encPayout);
        // ─────────────────────────────────────────────────────────────────────

        pendingPayouts[betId] = encPayout;
        bet.claimed = true;

        emit WinningsClaimed(betId, msg.sender, euint64.unwrap(encPayout));
    }

    /**
     * @notice Finalize withdrawal after off-chain FHE decryption.
     *         Proportional payout: (plainBetAmount × totalPool) / winnerPool
     *         Multiply before divide to avoid integer precision loss.
     *
     * @param betId          The bet to withdraw.
     * @param marketId       The market the bet belongs to.
     * @param plainBetAmount Decrypted bet amount (winner's stake, or 0 for losers).
     * @param ctHash         ctHash from CoFHE decryption.
     * @param signature      Signature from CoFHE threshold network.
     */
    function withdraw(
        uint256 betId,
        uint256 marketId,
        uint256 plainBetAmount,
        uint256 ctHash,
        bytes calldata signature
    ) external {
        require(bets[betId].bettor == msg.sender, "Not your bet");

        // Verify the CoFHE decryption result on-chain
        FHE.publishDecryptResult(ctHash, plainBetAmount, signature);

        if (plainBetAmount > 0) {
            Market storage market = markets[marketId];
            uint256 wPool = winnerPools[marketId];
            require(wPool > 0, "Winner pool not set");

            // Proportional payout: multiply first, then divide (preserves precision)
            uint256 payout = (plainBetAmount * market.totalPool) / wPool;
            require(address(this).balance >= payout, "Insufficient pool");
            payable(msg.sender).transfer(payout);
        }
    }

    receive() external payable {}
}

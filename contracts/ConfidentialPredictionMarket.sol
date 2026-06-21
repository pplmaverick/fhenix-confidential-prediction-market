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
 *   → submitResult → claimWinnings (FHE computation) → [off-chain decrypt] → withdraw
 *
 * Privacy: bet choices are encrypted on-chain via CoFHE; only the bettor can
 * decrypt their own choice via FHE.allowSender permission.
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

    mapping(uint256 => Market)   public markets;
    mapping(uint256 => Bet)      public bets;        // betId → Bet
    mapping(uint256 => uint256[]) public marketBets; // marketId → betIds

    // Encrypted payout ctHash stored after claimWinnings, for off-chain decryption
    mapping(uint256 => euint64) public pendingPayouts; // betId → encPayout

    // ─── Events ─────────────────────────────────────────────────────────────────

    event MarketCreated(uint256 indexed marketId, string question, address owner);
    event BetPlaced(uint256 indexed marketId, uint256 indexed betId, address indexed bettor);
    event MarketLocked(uint256 indexed marketId);
    event ResultSubmitted(uint256 indexed marketId, bool outcome);
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
     * @notice FHE-based payout computation.
     *         Privately computes whether the bettor's encrypted choice matches
     *         the plaintext outcome. Stores the encrypted payout ctHash and
     *         grants public decryption permission so the bettor can request
     *         decryption via the CoFHE threshold network.
     *
     * Production withdraw flow (after FHE coprocessor processes):
     *   1. Call claimWinnings → triggers FHE tasks
     *   2. Off-chain: client.decryptForTx(encPayoutCtHash)
     *   3. On-chain: call withdraw(betId, plainPayout, ctHash, signature)
     */
    function claimWinnings(uint256 betId, uint256 marketId) external {
        Market storage market = markets[marketId];
        require(market.resolved, "Market not resolved yet");

        Bet storage bet = bets[betId];
        require(bet.bettor == msg.sender, "Not your bet");
        require(!bet.claimed, "Already claimed");

        // ── FHE Winner Verification ──────────────────────────────────────────
        // 1. Encrypt the plaintext outcome to compare against encrypted choice
        ebool outcomeEnc = FHE.asEbool(market.outcome);

        // 2. Compare encrypted choice vs encrypted outcome (result is encrypted)
        ebool isWinner = FHE.eq(bet.encChoice, outcomeEnc);

        // 3. Compute encrypted payout: winner → bet amount, loser → 0
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
     *         Caller must obtain (plainPayout, signature) from the CoFHE
     *         threshold network by decrypting pendingPayouts[betId].
     */
    function withdraw(
        uint256 betId,
        uint256 plainPayout,
        uint256 ctHash,
        bytes calldata signature
    ) external {
        require(bets[betId].bettor == msg.sender, "Not your bet");
        require(address(this).balance >= plainPayout, "Insufficient pool");

        // Publish and verify the decryption result on-chain
        FHE.publishDecryptResult(ctHash, plainPayout, signature);

        if (plainPayout > 0) {
            payable(msg.sender).transfer(plainPayout);
        }
    }

    receive() external payable {}
}

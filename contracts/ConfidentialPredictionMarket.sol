// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    FHE,
    euint64,
    ebool,
    externalEbool
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

    // Per-bet withdrawal tracking, prevents double-claim/replay of withdraw() or withdrawRefund()
    mapping(uint256 => bool) public betWithdrawn; // betId → already withdrawn

    // Markets confirmed (via CoFHE decrypt proof) to have zero winners; eligible for refund
    mapping(uint256 => bool) public noWinnersMarket; // marketId → true

    // ─── Events ─────────────────────────────────────────────────────────────────

    event MarketCreated(uint256 indexed marketId, string question, address owner);
    event BetPlaced(uint256 indexed marketId, uint256 indexed betId, address indexed bettor);
    event MarketLocked(uint256 indexed marketId);
    event ResultSubmitted(uint256 indexed marketId, bool outcome);
    event WinnerPoolRevealed(uint256 indexed marketId, bytes32 encWinnerPoolCtHash);
    event WinnerPoolSet(uint256 indexed marketId, uint256 plainWinnerPool);
    event WinningsClaimed(uint256 indexed betId, address indexed bettor, bytes32 encPayoutCtHash);
    event NoWinnersSettled(uint256 indexed marketId);
    event RefundWithdrawn(uint256 indexed betId, address indexed bettor, uint256 amount);

    // ─── Actions ────────────────────────────────────────────────────────────────

    /**
     * @notice Create a new prediction market. Permissionless — any address may call
     *         this. The caller (msg.sender) is recorded as the market's owner, and
     *         only that address will later be able to call lockMarket()/submitResult()
     *         for this market (enforced via require(msg.sender == market.owner)).
     * @param question The market question text.
     * @return marketId The id assigned to the newly created market.
     */
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
     * @notice Create a new prediction market on behalf of a given `owner` address
     *         rather than msg.sender. Permissionless — any address may call this,
     *         and `owner` (not the caller) is recorded as the market's owner and is
     *         the only address that will later be able to call lockMarket()/
     *         submitResult() for this market. Intended for a relayer-style flow
     *         (e.g. the deprecated MarketFactory — see DEPLOYMENT.md); currently
     *         unused by the active frontend/scripts, which call createMarket()
     *         directly.
     * @param question The market question text.
     * @param owner    Address to record as the market's owner.
     * @return marketId The id assigned to the newly created market.
     */
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
     * @notice Place a bet with an encrypted choice; the encrypted stake amount is
     *         derived directly from msg.value so it can never diverge from the ETH sent.
     * @param marketId  Target market.
     * @param encChoice FHE-encrypted choice handle: encrypt(true) = Yes, encrypt(false) = No.
     * @param proof     CoFHE batch proof authorising encChoice for this contract. The
     *                  verifier binds the consuming contract address into the signed
     *                  digest, so a proof issued for another contract cannot be replayed here.
     */
    function placeBet(
        uint256 marketId,
        externalEbool encChoice,
        bytes calldata proof
    ) external payable returns (uint256 betId) {
        Market storage market = markets[marketId];
        require(!market.locked, "Market is locked");
        require(msg.value > 0, "Must send ETH as stake");
        require(msg.value <= type(uint64).max, "Stake exceeds euint64 range");

        // Encrypt msg.value directly — the bet amount can never diverge from the ETH paid
        euint64 amount = FHE.asEuint64(msg.value);
        ebool   choice = FHE.asEbool(encChoice, proof);

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

    /**
     * @notice Lock a market so no further bets can be placed. Restricted to the
     *         market's owner (require(msg.sender == market.owner)) — there is no
     *         contract-level admin role, only the per-market creator recorded at
     *         createMarket() time may lock it. No time/deadline condition is
     *         enforced on-chain; the contract has no concept of an end time, so
     *         this may be called at any point after creation.
     * @param marketId The market to lock.
     */
    function lockMarket(uint256 marketId) external {
        Market storage market = markets[marketId];
        require(msg.sender == market.owner, "Not market owner");
        require(!market.locked, "Already locked");
        market.locked = true;
        emit MarketLocked(marketId);
    }

    /**
     * @notice Submit the final outcome for a locked market. Restricted to the
     *         market's owner (require(msg.sender == market.owner)) — the same
     *         address-based restriction as lockMarket(), not a contract-level
     *         admin role. Must be called after lockMarket() and before any other
     *         call to submitResult() for this market (checks-effects ordering via
     *         market.locked / market.resolved); no time-based condition applies.
     * @param marketId The market to resolve.
     * @param outcome  true = Yes wins, false = No wins.
     */
    function submitResult(uint256 marketId, bool outcome) external {
        Market storage market = markets[marketId];
        require(msg.sender == market.owner, "Not market owner");
        require(market.locked, "Market must be locked first");
        require(!market.resolved, "Already resolved");
        market.resolved = true;
        market.outcome  = outcome;
        emit ResultSubmitted(marketId, outcome);
    }

    // ─── Views ──────────────────────────────────────────────────────────────────

    /**
     * @notice Read all fields of a market in a single call (the auto-generated
     *         `markets(id)` getter already returns the same tuple; this is an
     *         explicitly named convenience wrapper for frontend clarity).
     * @param marketId The market to read.
     * @return question   The market question text.
     * @return owner      The address that created the market (and controls
     *                     lockMarket()/submitResult()).
     * @return locked     Whether betting is closed.
     * @return resolved   Whether the outcome has been submitted.
     * @return outcome    true = Yes wins, false = No wins (meaningful only if resolved).
     * @return totalPool  Total ETH staked across all bets on this market, in wei.
     */
    function getMarketInfo(uint256 marketId) external view returns (
        string memory question,
        address owner,
        bool locked,
        bool resolved,
        bool outcome,
        uint256 totalPool
    ) {
        Market storage market = markets[marketId];
        return (market.question, market.owner, market.locked, market.resolved,
                market.outcome, market.totalPool);
    }

    /**
     * @notice Return the ids of all bets placed by `user`, across every market.
     *         Implemented as an on-chain scan over `bets[0..nextBetId)` filtered by
     *         `Bet.bettor` (no separate address-indexed mapping is maintained) so
     *         that placeBet() does not pay extra SSTORE gas on every real bet just
     *         to serve this off-chain (eth_call, zero-gas-to-caller) read. Cost
     *         scales with the total number of bets ever placed on the contract,
     *         not just `user`'s; fine at current volume, but would need an
     *         address-indexed mapping (paid for by extra write gas in placeBet())
     *         if bet volume grows large enough to strain node eth_call limits.
     * @param user The bettor address to look up.
     * @return betIds The ids of every bet placed by `user`.
     */
    function getBetsByAddress(address user) external view returns (uint256[] memory betIds) {
        uint256 count = 0;
        for (uint256 i = 0; i < nextBetId; i++) {
            if (bets[i].bettor == user) count++;
        }

        betIds = new uint256[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < nextBetId; i++) {
            if (bets[i].bettor == user) {
                betIds[j] = i;
                j++;
            }
        }
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
        require(!noWinnersMarket[marketId], "Market already settled as no-winners");
        require(plainWinnerPool > 0, "No winners - call settleNoWinners instead");
        FHE.publishDecryptResult(ctHash, plainWinnerPool, signature);
        winnerPools[marketId] = plainWinnerPool;
        emit WinnerPoolSet(marketId, plainWinnerPool);
    }

    /**
     * @notice Settle a market where the decrypted winner pool is zero (nobody picked the
     *         winning side). Verifies the zero result via the CoFHE decrypt proof, then
     *         marks the market as refund-eligible so bettors can reclaim their stakes
     *         via withdrawRefund(). Call with (ctHash, signature) obtained from
     *         decryptForTx() on the revealWinnerPool() result.
     */
    function settleNoWinners(
        uint256 marketId,
        uint256 ctHash,
        bytes calldata signature
    ) external {
        Market storage market = markets[marketId];
        require(market.locked, "Market not locked");
        require(market.resolved, "Market not resolved");
        require(winnerPools[marketId] == 0, "Winner pool already set");
        require(!noWinnersMarket[marketId], "Already settled as no-winners");

        // Verify the CoFHE decryption proves the winner pool is exactly zero
        FHE.publishDecryptResult(ctHash, 0, signature);

        noWinnersMarket[marketId] = true;
        emit NoWinnersSettled(marketId);
    }

    /**
     * @notice Reclaim the original stake for a bet in a market settled as no-winners.
     * @param betId    The bet to refund.
     * @param marketId The market the bet belongs to.
     */
    function withdrawRefund(uint256 betId, uint256 marketId) external {
        require(bets[betId].bettor == msg.sender, "Not your bet");
        require(noWinnersMarket[marketId], "Market not settled as no-winners");
        require(!betWithdrawn[betId], "Already withdrawn");

        uint256 amount = bets[betId].plainAmount;
        require(amount > 0, "Nothing to refund");

        betWithdrawn[betId] = true; // checks-effects-interactions
        payable(msg.sender).transfer(amount);

        emit RefundWithdrawn(betId, msg.sender, amount);
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
        require(!betWithdrawn[betId], "Already withdrawn");

        // Verify the CoFHE decryption result on-chain
        FHE.publishDecryptResult(ctHash, plainBetAmount, signature);

        // Checks-effects-interactions: mark withdrawn before any transfer
        betWithdrawn[betId] = true;

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

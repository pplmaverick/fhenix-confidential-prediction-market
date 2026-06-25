// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./ConfidentialPredictionMarket.sol";

contract MarketFactory {
    struct MarketMeta {
        address market;
        address creator;
        string question;
        string[] options;
        uint256 endTime;
    }

    address[] public markets;
    MarketMeta[] private _metas;

    event MarketCreated(address indexed market, address indexed creator);

    function createMarket(
        string memory _question,
        string[] memory _options,
        uint256 _endTime
    ) external returns (address marketAddr) {
        ConfidentialPredictionMarket cpm = new ConfidentialPredictionMarket();
        cpm.createMarketFor(_question, msg.sender);

        marketAddr = address(cpm);
        markets.push(marketAddr);

        _metas.push();
        MarketMeta storage m = _metas[_metas.length - 1];
        m.market = marketAddr;
        m.creator = msg.sender;
        m.question = _question;
        m.endTime = _endTime;
        for (uint256 i = 0; i < _options.length; i++) {
            m.options.push(_options[i]);
        }

        emit MarketCreated(marketAddr, msg.sender);
    }

    function getMarkets() external view returns (address[] memory) {
        return markets;
    }
}

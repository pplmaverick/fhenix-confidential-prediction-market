export const CONTRACT_ADDRESS = '0x79Dc91B97979E8d3cD6A56039EB2C282163b02aB' as const

export const FACTORY_ADDRESS = '0x575FF2bb9f8F5Ef5Bd0198F316Cd7a1a7e8482FA' as const

export const FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'string', name: '_question', type: 'string' },
      { internalType: 'string[]', name: '_options', type: 'string[]' },
      { internalType: 'uint256', name: '_endTime', type: 'uint256' },
    ],
    name: 'createMarket',
    outputs: [{ internalType: 'address', name: 'marketAddr', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getMarkets',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'markets',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'market', type: 'address' },
      { indexed: true, internalType: 'address', name: 'creator', type: 'address' },
    ],
    name: 'MarketCreated',
    type: 'event',
  },
] as const

export const CHAIN_ID = 421614 // Arbitrum Sepolia

export const ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'marketId', type: 'uint256' },
      {
        components: [
          { internalType: 'uint256', name: 'ctHash', type: 'uint256' },
          { internalType: 'uint8', name: 'securityZone', type: 'uint8' },
          { internalType: 'uint8', name: 'utype', type: 'uint8' },
          { internalType: 'bytes', name: 'signature', type: 'bytes' },
        ],
        internalType: 'struct InEuint64',
        name: 'encAmount',
        type: 'tuple',
      },
      {
        components: [
          { internalType: 'uint256', name: 'ctHash', type: 'uint256' },
          { internalType: 'uint8', name: 'securityZone', type: 'uint8' },
          { internalType: 'uint8', name: 'utype', type: 'uint8' },
          { internalType: 'bytes', name: 'signature', type: 'bytes' },
        ],
        internalType: 'struct InEbool',
        name: 'encChoice',
        type: 'tuple',
      },
    ],
    name: 'placeBet',
    outputs: [{ internalType: 'uint256', name: 'betId', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'betId', type: 'uint256' },
      { internalType: 'uint256', name: 'marketId', type: 'uint256' },
    ],
    name: 'claimWinnings',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'markets',
    outputs: [
      { internalType: 'string', name: 'question', type: 'string' },
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'bool', name: 'locked', type: 'bool' },
      { internalType: 'bool', name: 'resolved', type: 'bool' },
      { internalType: 'bool', name: 'outcome', type: 'bool' },
      { internalType: 'uint256', name: 'totalPool', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextMarketId',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextBetId',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
      { internalType: 'uint256', name: '', type: 'uint256' },
    ],
    name: 'marketBets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'pendingPayouts',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'betId', type: 'uint256' },
      { internalType: 'uint256', name: 'marketId', type: 'uint256' },
      { internalType: 'uint256', name: 'plainBetAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'ctHash', type: 'uint256' },
      { internalType: 'bytes', name: 'signature', type: 'bytes' },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'marketId', type: 'uint256' }],
    name: 'revealWinnerPool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'marketId', type: 'uint256' },
      { internalType: 'uint256', name: 'plainWinnerPool', type: 'uint256' },
      { internalType: 'uint256', name: 'ctHash', type: 'uint256' },
      { internalType: 'bytes', name: 'signature', type: 'bytes' },
    ],
    name: 'submitWinnerPool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'winnerPools',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'encWinnerPools',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'betId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'bettor', type: 'address' },
      { indexed: false, internalType: 'bytes32', name: 'encPayoutCtHash', type: 'bytes32' },
    ],
    name: 'WinningsClaimed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'marketId', type: 'uint256' },
      { indexed: false, internalType: 'bytes32', name: 'encWinnerPoolCtHash', type: 'bytes32' },
    ],
    name: 'WinnerPoolRevealed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'marketId', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'plainWinnerPool', type: 'uint256' },
    ],
    name: 'WinnerPoolSet',
    type: 'event',
  },
] as const

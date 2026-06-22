export const CONTRACT_ADDRESS = '0x072A3A0C04Cf8CDcaf5B4A73a4Ed4fF5A841531f' as const

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
] as const

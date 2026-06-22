import { createConfig, http } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'

// 不手動加 connectors，讓 wagmi v2 的 EIP-6963 自動偵測所有已安裝錢包
// （MetaMask、OKX Wallet 等都支援 EIP-6963，會自動出現在列表中）
export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
})

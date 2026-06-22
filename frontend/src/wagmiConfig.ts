import { createConfig, http } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { injected, metaMask } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    metaMask(),
    injected({
      target: {
        id: 'okxwallet',
        name: 'OKX Wallet',
        // provider 為函數，connect 時才讀取 window.okxwallet
        provider(window) {
          return (window as any)?.okxwallet
        },
      },
    }),
  ],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
})

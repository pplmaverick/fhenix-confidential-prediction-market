import { createConfig, http } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    injected(), // MetaMask / window.ethereum
    injected({  // OKX Wallet / window.okxwallet
      target: {
        id: 'okxwallet',
        name: 'OKX Wallet',
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

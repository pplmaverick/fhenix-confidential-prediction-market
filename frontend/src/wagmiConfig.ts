import { createConfig, http } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { injected, metaMask } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    injected(),
    metaMask(),
    injected({
      target() {
        return {
          id: 'okxwallet',
          name: 'OKX Wallet',
          provider:
            typeof window !== 'undefined'
              ? (window as any).okxwallet
              : undefined,
        }
      },
    }),
  ],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
})

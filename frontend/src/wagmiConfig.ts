import { createConfig, http } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { injected, metaMask } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [injected(), metaMask()],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
})

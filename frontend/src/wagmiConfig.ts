import { createConfig, http } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { pickMetaMaskProvider, pickOkxProvider } from './walletProviders'

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    injected({  // MetaMask — explicitly rejects an OKX impersonator on window.ethereum
      target: {
        id: 'metamask',
        name: 'MetaMask',
        provider: pickMetaMaskProvider,
      },
    }),
    injected({  // OKX Wallet / window.okxwallet
      target: {
        id: 'okxwallet',
        name: 'OKX Wallet',
        provider: pickOkxProvider,
      },
    }),
  ],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
})

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
          // DEBUG: OKX compatibility diagnosis
          console.log('[DEBUG] window.ethereum:', window?.ethereum)
          console.log('[DEBUG] window.ethereum.isMetaMask:', (window?.ethereum as any)?.isMetaMask)
          console.log('[DEBUG] window.ethereum.isOKExWallet:', (window?.ethereum as any)?.isOKExWallet)
          console.log('[DEBUG] window.okxwallet:', (window as any)?.okxwallet)
          console.log('[DEBUG] providers list:', (window?.ethereum as any)?.providers)
          return (window as any)?.okxwallet
        },
      },
    }),
  ],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
})

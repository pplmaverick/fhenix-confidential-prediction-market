import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from './wagmiConfig'
import App from './App.tsx'
import './index.css'

// DEBUG: Intercept all wallet requests for OKX diagnosis
if (typeof window !== 'undefined' && (window as any).ethereum) {
  try {
    const originalRequest = (window as any).ethereum.request.bind(
      (window as any).ethereum
    )
    ;(window as any).ethereum.request = async (args: any) => {
      if (
        args.method === 'eth_signTypedData_v4' ||
        args.method === 'eth_signTypedData' ||
        args.method === 'wallet_requestPermissions'
      ) {
        console.log('[DEBUG] wallet.request intercepted:', args.method)
        console.log('[DEBUG] Full request payload:', JSON.stringify(args, null, 2))
      }
      try {
        const result = await originalRequest(args)
        if (
          args.method === 'eth_signTypedData_v4' ||
          args.method === 'eth_signTypedData'
        ) {
          console.log('[DEBUG] Signing SUCCESS, result:', result)
        }
        return result
      } catch (err) {
        if (
          args.method === 'eth_signTypedData_v4' ||
          args.method === 'eth_signTypedData'
        ) {
          console.log('[DEBUG] Signing FAILED:', err)
        }
        throw err
      }
    }
    console.log('[DEBUG] monkey-patch applied successfully')
  } catch (patchErr) {
    // window.ethereum.request is non-writable (common in MetaMask)
    // fallback: log a warning, signing interception will not work
    console.warn('[DEBUG] monkey-patch failed (non-writable), using passive logging only:', patchErr)
  }
}

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)

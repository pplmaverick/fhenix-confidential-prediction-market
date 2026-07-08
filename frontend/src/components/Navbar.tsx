import { useState, useRef, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain, useChainId } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { CHAIN_ID } from '../contract'
import { pickMetaMaskProvider, pickOkxProvider } from '../walletProviders'

interface NavbarProps {
  cofheReady: boolean
}

// Connectors are created inline in onClick (arc/tempo pattern)
const metaMaskConnector = () =>
  injected({
    target: {
      id: 'metamask',
      name: 'MetaMask',
      provider: pickMetaMaskProvider,
    },
  })

const okxConnector = () =>
  injected({
    target: {
      id: 'okxwallet',
      name: 'OKX Wallet',
      provider: pickOkxProvider,
    },
  })

export function Navbar({ cofheReady }: NavbarProps) {
  const { address, isConnected } = useAccount()
  const { connect, error: connectError, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const chainId = useChainId()

  const wrongChain = isConnected && chainId !== CHAIN_ID
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  // OKX Wallet can claim window.ethereum such that no real MetaMask provider
  // is resolvable even with both extensions installed. Surface this so the
  // user has a manual workaround (use OKX directly, or disable one extension)
  // instead of a silently-disappearing MetaMask option.
  const hasWalletConflict =
    typeof window !== 'undefined' &&
    !!(window as any).okxwallet &&
    !!(window as any).ethereum &&
    !pickMetaMaskProvider(window)

  const [showWallets, setShowWallets] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowWallets(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isConnected) setShowWallets(false)
  }, [isConnected])

  const walletOptions = [
    {
      label: 'MetaMask',
      connector: metaMaskConnector,
      // Explicitly resolve the real MetaMask provider — if OKX is installed and
      // impersonating window.ethereum, this option won't show up at all rather
      // than silently connecting to the wrong wallet (see walletProviders.ts).
      available: typeof window !== 'undefined' && !!pickMetaMaskProvider(window),
    },
    {
      label: 'OKX Wallet',
      connector: okxConnector,
      available: typeof window !== 'undefined' && !!pickOkxProvider(window),
    },
  ].filter((w) => w.available)

  return (
    <header className="bg-surface/90 backdrop-blur-md border-b border-outline-variant sticky top-0 z-50">
      <div className="flex flex-col max-w-container-max mx-auto">
        <div className="flex justify-between items-center px-gutter py-4">
          {/* Logo */}
          <div className="flex items-center gap-md">
            <div className="w-8 h-8 rounded-xl bg-primary-container flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-lg leading-none">F</span>
            </div>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tight hidden sm:block">
              Fhenix Confidential Market
            </h1>
            <h1 className="font-headline-lg-mobile text-xl text-primary tracking-tight sm:hidden">
              FHE Market
            </h1>
          </div>

          {/* Desktop right */}
          <div className="hidden md:flex items-center gap-lg">
            <nav className="flex gap-md">
              <a className="font-label-caps text-label-caps text-primary border-b-2 border-primary pb-1" href="#">
                Markets
              </a>
              <a
                className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('activity-log')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                Activity
              </a>
            </nav>

            {!isConnected ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  className="bg-primary-container text-white px-md py-sm rounded-xl font-bold text-sm hover:opacity-80 transition-all active:scale-95 disabled:opacity-60 flex items-center gap-xs"
                  disabled={isPending}
                  onClick={() => {
                    if (walletOptions.length === 1) {
                      connect({ connector: walletOptions[0].connector() })
                    } else {
                      setShowWallets((v) => !v)
                    }
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    account_balance_wallet
                  </span>
                  {isPending ? 'Connecting...' : 'Connect Wallet'}
                  {walletOptions.length > 1 && (
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {showWallets ? 'expand_less' : 'expand_more'}
                    </span>
                  )}
                </button>

                {showWallets && walletOptions.length > 1 && (
                  <div className="absolute right-0 top-full mt-sm w-48 confidential-card rounded-xl py-xs shadow-xl z-50">
                    {walletOptions.map((w) => (
                      <button
                        key={w.label}
                        className="w-full text-left px-md py-sm hover:bg-surface-container-high transition-colors font-label-caps text-sm text-on-surface flex items-center gap-sm disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => connect({ connector: w.connector() })}
                      >
                        <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>
                          account_balance_wallet
                        </span>
                        {w.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-sm">
                {wrongChain && (
                  <button
                    className="text-error text-xs font-bold px-md py-sm rounded-xl border border-error hover:bg-error/10 transition-all"
                    onClick={() => switchChain({ chainId: CHAIN_ID })}
                  >
                    Switch Network
                  </button>
                )}
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cofheReady ? 'bg-tertiary' : 'bg-amber-400'} animate-pulse`} />
                <span className="font-code-md text-code-md text-on-surface-variant">{shortAddress}</span>
                <button
                  className="font-label-caps text-label-caps text-on-surface-variant hover:text-error transition-colors"
                  onClick={() => disconnect()}
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {/* Mobile */}
          <div className="md:hidden">
            {!isConnected ? (
              <button
                className="bg-primary-container text-white px-sm py-xs rounded-xl font-bold text-xs disabled:opacity-60"
                disabled={isPending}
                onClick={() => {
                  const first = walletOptions[0]
                  if (first) connect({ connector: first.connector() })
                }}
              >
                {isPending ? '...' : 'Connect'}
              </button>
            ) : (
              <div className="flex items-center gap-xs">
                <span className={`w-2 h-2 rounded-full ${cofheReady ? 'bg-tertiary' : 'bg-amber-400'} animate-pulse`} />
                <span className="font-code-md text-xs text-on-surface-variant">{shortAddress}</span>
              </div>
            )}
          </div>
        </div>

        {/* Wallet conflict: OKX Wallet is claiming window.ethereum so no distinct
            MetaMask provider can be found even though both are installed */}
        {!isConnected && hasWalletConflict && (
          <div className="px-gutter pb-sm">
            <p className="text-amber-400 text-xs font-label-caps bg-amber-400/10 border border-amber-400/30 rounded px-md py-xs">
              MetaMask and OKX Wallet conflict detected — OKX is claiming the browser's shared wallet slot,
              so a real MetaMask provider can't be found. Use the "OKX Wallet" option instead, or disable
              the OKX Wallet extension and refresh to use MetaMask.
            </p>
          </div>
        )}

        {/* Connection error */}
        {connectError && (
          <div className="px-gutter pb-sm">
            <p className="text-error text-xs font-label-caps bg-error-container/20 border border-error/30 rounded px-md py-xs">
              Connection failed: {connectError.message}
            </p>
          </div>
        )}
      </div>
    </header>
  )
}

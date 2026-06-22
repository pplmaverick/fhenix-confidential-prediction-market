import { useState, useRef, useEffect } from 'react'
import type { Connector } from 'wagmi'
import { CHAIN_ID } from '../contract'

interface NavbarProps {
  isConnected: boolean
  address: string | undefined
  connectors: readonly Connector[]
  connect: (args: { connector: Connector }) => void
  disconnect: () => void
  switchChain: (args: { chainId: number }) => void
  wrongChain: boolean
  cofheReady: boolean
}

export function Navbar({
  isConnected,
  address,
  connectors,
  connect,
  disconnect,
  switchChain,
  wrongChain,
  cofheReady,
}: NavbarProps) {
  const [showWallets, setShowWallets] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  // 點外面關閉下拉選單
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowWallets(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 過濾掉 provider 不存在的 connector（例如沒裝 OKX 就不顯示）
  const availableConnectors = connectors.filter((c) => {
    if (c.id === 'okxwallet') {
      return typeof window !== 'undefined' && !!(window as any).okxwallet
    }
    return true
  })

  return (
    <header className="bg-surface/90 backdrop-blur-md border-b border-outline-variant sticky top-0 z-50">
      <div className="flex justify-between items-center px-gutter py-4 max-w-container-max mx-auto">
        {/* Logo + Title */}
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

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-lg">
          <nav className="flex gap-md">
            <a
              className="font-label-caps text-label-caps text-primary border-b-2 border-primary pb-1"
              href="#"
            >
              Markets
            </a>
            <a
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              onClick={(e) => {
                e.preventDefault()
                document
                  .getElementById('activity-log')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Activity
            </a>
          </nav>

          {!isConnected ? (
            /* 錢包選單 */
            <div className="relative" ref={dropdownRef}>
              <button
                className="bg-primary-container text-white px-md py-sm rounded-xl font-bold text-sm hover:opacity-80 transition-all active:scale-95 flex items-center gap-xs"
                onClick={() => setShowWallets((v) => !v)}
              >
                Connect Wallet
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                >
                  {showWallets ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {showWallets && (
                <div className="absolute right-0 top-full mt-sm w-52 confidential-card rounded-xl py-xs shadow-xl z-50">
                  {availableConnectors.map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-md py-sm hover:bg-surface-container-high transition-colors font-label-caps text-sm text-on-surface flex items-center gap-sm"
                      onClick={() => {
                        connect({ connector: c })
                        setShowWallets(false)
                      }}
                    >
                      <span
                        className="material-symbols-outlined text-primary"
                        style={{ fontSize: 18 }}
                      >
                        account_balance_wallet
                      </span>
                      {c.name}
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
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  cofheReady ? 'bg-tertiary' : 'bg-amber-400'
                } animate-pulse`}
              />
              <span className="font-code-md text-code-md text-on-surface-variant">
                {shortAddress}
              </span>
              <button
                className="font-label-caps text-label-caps text-on-surface-variant hover:text-error transition-colors"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Mobile */}
        <div className="md:hidden flex items-center gap-sm">
          {!isConnected ? (
            <div className="relative" ref={dropdownRef}>
              <button
                className="bg-primary-container text-white px-sm py-xs rounded-xl font-bold text-xs"
                onClick={() => setShowWallets((v) => !v)}
              >
                Connect
              </button>
              {showWallets && (
                <div className="absolute right-0 top-full mt-sm w-44 confidential-card rounded-xl py-xs shadow-xl z-50">
                  {availableConnectors.map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-md py-sm hover:bg-surface-container-high transition-colors font-label-caps text-xs text-on-surface"
                      onClick={() => {
                        connect({ connector: c })
                        setShowWallets(false)
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-xs">
              <span
                className={`w-2 h-2 rounded-full ${cofheReady ? 'bg-tertiary' : 'bg-amber-400'} animate-pulse`}
              />
              <span className="font-code-md text-xs text-on-surface-variant">
                {shortAddress}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

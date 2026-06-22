import { useAccount, useConnect, useDisconnect, useSwitchChain, useChainId } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { CHAIN_ID } from '../contract'

interface NavbarProps {
  cofheReady: boolean
}

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
              <button
                className="bg-primary-container text-white px-md py-sm rounded-xl font-bold text-sm hover:opacity-80 transition-all active:scale-95 disabled:opacity-60 flex items-center gap-xs"
                disabled={isPending}
                onClick={() => connect({ connector: injected() })}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  account_balance_wallet
                </span>
                {isPending ? 'Connecting...' : 'Connect Wallet'}
              </button>
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
                onClick={() => connect({ connector: injected() })}
              >
                {isPending ? '...' : 'Connect'}
              </button>
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

        {/* 錯誤提示 */}
        {connectError && (
          <div className="px-gutter pb-sm">
            <p className="text-error text-xs font-label-caps bg-error-container/20 border border-error/30 rounded px-md py-xs">
              連線失敗：{connectError.message}
            </p>
          </div>
        )}
      </div>
    </header>
  )
}

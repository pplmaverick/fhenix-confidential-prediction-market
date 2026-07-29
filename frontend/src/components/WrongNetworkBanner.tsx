import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'

export function WrongNetworkBanner() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === arbitrumSepolia.id) return null

  return (
    <div className="w-full bg-error-container border-b border-error/30">
      <div className="max-w-container-max mx-auto px-gutter py-sm flex items-center justify-between gap-md flex-wrap">
        <div className="flex items-center gap-sm">
          <span className="material-symbols-outlined text-on-error-container" style={{ fontSize: 18 }}>
            warning
          </span>
          <p className="font-label-caps text-label-caps text-on-error-container">
            Wrong Network — Please switch to Arbitrum Sepolia
          </p>
        </div>
        <button
          className="bg-error text-on-error px-md py-xs rounded-xl font-bold text-xs hover:opacity-80 transition-all active:scale-95 disabled:opacity-60"
          disabled={isPending}
          onClick={() => switchChain({ chainId: arbitrumSepolia.id })}
        >
          {isPending ? 'Switching...' : 'Switch Network'}
        </button>
      </div>
    </div>
  )
}

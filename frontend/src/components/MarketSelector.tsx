import { useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACT_ADDRESS, ABI } from '../contract'

type MarketTuple = readonly [string, `0x${string}`, boolean, boolean, boolean, bigint]

interface MarketSelectorProps {
  marketCount: number
  selectedId: string
  onSelect: (id: string) => void
}

export function MarketSelector({ marketCount, selectedId, onSelect }: MarketSelectorProps) {
  const contracts = Array.from({ length: marketCount }, (_, i) => ({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: ABI,
    functionName: 'markets' as const,
    args: [BigInt(i)] as const,
  }))

  const { data } = useReadContracts({ contracts })

  if (marketCount === 0) {
    return (
      <div className="text-center py-lg text-on-surface-variant font-body-sm text-body-sm">
        尚無市場。請等待 owner 建立市場。
      </div>
    )
  }

  return (
    <div className="space-y-sm">
      {Array.from({ length: marketCount }, (_, i) => {
        const result = data?.[i]
        const market = result?.status === 'success' ? (result.result as MarketTuple) : null
        const isSelected = selectedId === String(i)

        const isLocked = market?.[2] ?? false
        const isResolved = market?.[3] ?? false
        const status = isResolved ? 'RESOLVED' : isLocked ? 'LOCKED' : 'OPEN'
        const statusColor = isResolved
          ? 'text-secondary'
          : isLocked
            ? 'text-amber-400'
            : 'text-tertiary'
        const totalPool = market?.[5] ?? 0n

        return (
          <button
            key={i}
            onClick={() => onSelect(String(i))}
            className={`w-full text-left px-lg py-md rounded-xl border transition-all ${
              isSelected
                ? 'border-primary bg-primary-container/10'
                : 'border-outline-variant bg-surface-container/30 hover:border-primary/50 hover:bg-surface-container/60'
            }`}
          >
            <div className="flex items-center justify-between gap-md">
              <div className="flex items-center gap-sm min-w-0">
                <span className="font-code-md text-[11px] text-on-surface-variant flex-shrink-0">
                  #{i}
                </span>
                <span className="font-body-sm text-sm text-on-surface truncate">
                  {market ? market[0] : <span className="animate-pulse bg-surface-container-high rounded w-48 h-4 inline-block" />}
                </span>
              </div>
              <div className="flex items-center gap-md flex-shrink-0">
                <span className="font-code-md text-[11px] text-on-surface-variant">
                  {formatEther(totalPool).slice(0, 6)} ETH
                </span>
                <span className={`font-label-caps text-[10px] font-bold ${statusColor}`}>
                  {status}
                </span>
                {isSelected && (
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>
                    check_circle
                  </span>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

import { formatEther } from 'viem'
import { CONTRACT_ADDRESS } from '../contract'

interface MarketCardProps {
  marketId: string
  setMarketId: (id: string) => void
  marketData:
    | readonly [string, `0x${string}`, boolean, boolean, boolean, bigint]
    | undefined
  nextMarketId: bigint | undefined
  nextBetId: bigint | undefined
  refetchMarket: () => void
}

export function MarketCard({
  marketId,
  setMarketId,
  marketData,
  nextMarketId,
  nextBetId,
  refetchMarket,
}: MarketCardProps) {
  const question = marketData?.[0] ?? ''
  const isLocked = marketData?.[2] ?? false
  const isResolved = marketData?.[3] ?? false
  const outcome = marketData?.[4] ?? false
  const totalPool = marketData?.[5] ?? 0n

  const status = isResolved ? 'RESOLVED' : isLocked ? 'LOCKED' : 'OPEN'
  const statusBg = isResolved
    ? 'bg-secondary-container text-on-secondary'
    : isLocked
      ? 'bg-amber-600 text-white'
      : 'bg-tertiary-container text-on-tertiary-container'

  return (
    <div className="flex flex-col gap-md">
      {/* Main card */}
      <div className="confidential-card rounded-xl p-lg">
        {/* Diagonal decoration */}
        <div className="absolute top-0 right-0 w-48 h-48 diagonal-pattern opacity-30 pointer-events-none" />

        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-sm mb-md relative">
          <div className="flex items-center gap-xs">
            <span
              className={`${statusBg} px-sm py-[2px] rounded text-xs font-bold tracking-wider font-label-caps`}
            >
              {status}
            </span>
            <div className="flex items-center gap-[2px] bg-primary-container/20 border border-primary/30 px-sm py-[2px] rounded">
              <span
                className="material-symbols-outlined text-primary"
                style={{
                  fontSize: 14,
                  fontVariationSettings: "'FILL' 1",
                }}
              >
                lock
              </span>
              <span className="font-label-caps text-[10px] text-primary">
                FHE-ENABLED
              </span>
            </div>
          </div>

          {/* Market ID input */}
          <div className="flex items-center gap-xs">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">
              Market
            </span>
            <span className="font-label-caps text-[10px] text-on-surface-variant">#</span>
            <input
              className="w-14 bg-transparent border border-outline-variant rounded px-sm py-[2px] text-xs font-code-md text-on-surface focus:outline-none focus:border-primary text-center"
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
              onBlur={() => refetchMarket()}
            />
          </div>
        </div>

        {/* Question */}
        <div className="relative mb-lg">
          {question ? (
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface flex items-start gap-sm leading-tight">
              {question}
              <span className="material-symbols-outlined text-tertiary flex-shrink-0 mt-1">
                verified_user
              </span>
            </h2>
          ) : (
            <div className="space-y-sm">
              <div className="h-7 bg-surface-container-high rounded animate-pulse w-3/4" />
              <div className="h-7 bg-surface-container-high rounded animate-pulse w-1/2" />
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-md border-t border-outline-variant/50 pt-lg">
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase mb-xs tracking-widest">
              Total Pool
            </p>
            <p className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-secondary">
              {formatEther(totalPool).slice(0, 8)}
            </p>
            <p className="font-code-md text-[10px] text-on-surface-variant">ETH</p>
          </div>
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase mb-xs tracking-widest">
              Markets
            </p>
            <p className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">
              {nextMarketId?.toString() ?? '—'}
            </p>
          </div>
          <div>
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase mb-xs tracking-widest">
              Total Bets
            </p>
            <p className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">
              {nextBetId?.toString() ?? '—'}
            </p>
          </div>
        </div>

        {/* Resolved outcome banner */}
        {isResolved && (
          <div
            className={`mt-md px-md py-sm rounded-xl border text-sm font-bold font-label-caps ${
              outcome
                ? 'bg-tertiary-container/20 border-tertiary text-on-tertiary-container'
                : 'bg-error-container/20 border-error text-error'
            }`}
          >
            Outcome: {outcome ? '✓ YES wins' : '✗ NO wins'}
          </div>
        )}

        {/* Contract address */}
        <div className="mt-lg pt-md border-t border-outline-variant/30">
          <p className="font-label-caps text-[10px] text-on-surface-variant">
            Contract:{' '}
            <a
              href={`https://sepolia.arbiscan.io/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline font-code-md"
            >
              {CONTRACT_ADDRESS.slice(0, 10)}...{CONTRACT_ADDRESS.slice(-6)}
            </a>
            {' · '}Arbitrum Sepolia
          </p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex gap-sm flex-wrap">
        {['#FHE', '#Fhenix', '#Arbitrum', '#DeFi', '#Predictions'].map(
          (tag) => (
            <span
              key={tag}
              className="px-md py-[2px] border border-outline-variant rounded-full text-[11px] font-label-caps text-on-surface-variant hover:border-primary hover:text-primary transition-colors cursor-default"
            >
              {tag}
            </span>
          ),
        )}
      </div>
    </div>
  )
}

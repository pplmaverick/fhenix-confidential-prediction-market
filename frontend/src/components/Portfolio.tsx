import { formatEther } from 'viem'
import { useMyBets } from './MyBets'

interface PortfolioProps {
  cofheReady: boolean
}

export function Portfolio({ cofheReady }: PortfolioProps) {
  const { rows, isConnected, loading, error } = useMyBets({ cofheReady })

  if (!isConnected) {
    return (
      <div className="confidential-card rounded-xl p-lg text-center py-xl">
        <span className="material-symbols-outlined text-on-surface-variant/30 block mb-sm" style={{ fontSize: 40 }}>
          account_balance_wallet
        </span>
        <p className="text-on-surface-variant font-body-sm text-body-sm">Connect your wallet to see your portfolio</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="confidential-card rounded-xl p-lg">
        <p className="text-error font-body-sm text-body-sm">Failed to load portfolio: {error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="confidential-card rounded-xl p-lg text-center py-xl">
        <span className="material-symbols-outlined text-on-surface-variant/50 animate-spin block mb-sm" style={{ fontSize: 32 }}>
          progress_activity
        </span>
        <p className="text-on-surface-variant font-body-sm text-body-sm">Loading your portfolio...</p>
      </div>
    )
  }

  const totalBets = rows.length
  const totalWagered = rows.reduce((sum, r) => sum + r.plainAmount, 0n)

  // Unclaimed winnings: resolved markets, my choice decrypted, matches the outcome,
  // and withdraw() hasn't landed yet. Bets whose choice hasn't decrypted yet
  // (myChoice === undefined) aren't counted — the true win/loss isn't known yet.
  const unclaimedWinnings = rows.reduce((sum, r) => {
    const isWinner = r.resolved && r.myChoice !== undefined && r.myChoice === r.outcome
    return isWinner && !r.withdrawn ? sum + r.plainAmount : sum
  }, 0n)

  const pendingDecrypts = rows.filter(
    (r) => r.resolved && r.myChoice === undefined && !r.withdrawn,
  ).length

  const stats = [
    {
      label: 'Total Bets',
      value: totalBets.toString(),
      icon: 'receipt_long',
      color: 'text-on-surface',
    },
    {
      label: 'Total Wagered',
      value: `${formatEther(totalWagered).slice(0, 8)} ETH`,
      icon: 'account_balance_wallet',
      color: 'text-secondary',
    },
    {
      label: 'Unclaimed Winnings',
      value: `${formatEther(unclaimedWinnings).slice(0, 8)} ETH`,
      icon: 'redeem',
      color: 'text-tertiary',
    },
  ]

  return (
    <div className="space-y-lg">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
        {stats.map((stat) => (
          <div key={stat.label} className="confidential-card rounded-xl p-lg">
            <div className="flex items-center gap-xs mb-sm">
              <span className={`material-symbols-outlined ${stat.color}`} style={{ fontSize: 18 }}>
                {stat.icon}
              </span>
              <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">
                {stat.label}
              </p>
            </div>
            <p className={`font-headline-lg-mobile text-headline-lg-mobile font-bold ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {pendingDecrypts > 0 && (
        <div className="flex items-center gap-sm px-md py-sm rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-label-caps">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            lock_clock
          </span>
          {pendingDecrypts} resolved bet{pendingDecrypts > 1 ? 's' : ''} still decrypting — switch to My Bets once
          CoFHE is ready to see the full result.
        </div>
      )}

      {totalBets === 0 && (
        <div className="confidential-card rounded-xl p-lg text-center py-xl">
          <span className="material-symbols-outlined text-on-surface-variant/30 block mb-sm" style={{ fontSize: 40 }}>
            insights
          </span>
          <p className="text-on-surface-variant font-body-sm text-body-sm">
            No activity yet — place a bet to start building your portfolio
          </p>
        </div>
      )}
    </div>
  )
}

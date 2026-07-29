import { useEffect, useState } from 'react'
import { useAccount, usePublicClient, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { FheTypes } from '@cofhe/sdk'
import { cofheClient } from '../cofheClient'
import { CONTRACT_ADDRESS, ABI } from '../contract'

type MarketTuple = readonly [string, `0x${string}`, boolean, boolean, boolean, bigint]
type BetTuple = readonly [`0x${string}`, `0x${string}`, bigint, `0x${string}`, boolean]

interface BetLog {
  marketId: bigint
  betId: bigint
}

export interface MyBetRow {
  betId: bigint
  marketId: bigint
  question: string
  plainAmount: bigint
  locked: boolean
  resolved: boolean
  outcome: boolean
  withdrawn: boolean
  myChoice: boolean | undefined
  isDecrypting: boolean
}

interface MyBetsDataProps {
  cofheReady: boolean
  onRowsChange?: (rows: MyBetRow[]) => void
}

// Shared data-fetching hook so Portfolio can reuse the exact same bet list
// (event logs + on-chain reads + FHE choice decryption) without duplicating it.
export function useMyBets({ cofheReady }: MyBetsDataProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const [betLogs, setBetLogs] = useState<BetLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)

  useEffect(() => {
    if (!publicClient || !address) {
      setBetLogs([])
      return
    }
    let cancelled = false
    setLogsLoading(true)
    setLogsError(null)
    publicClient
      .getContractEvents({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        eventName: 'BetPlaced',
        args: { bettor: address },
        fromBlock: 0n,
        toBlock: 'latest',
      })
      .then((logs) => {
        if (cancelled) return
        const parsed = logs
          .map((log) => {
            const args = log.args as { marketId?: bigint; betId?: bigint }
            if (args.marketId === undefined || args.betId === undefined) return null
            return { marketId: args.marketId, betId: args.betId }
          })
          .filter((l): l is BetLog => l !== null)
        setBetLogs(parsed)
      })
      .catch((e: any) => {
        if (!cancelled) setLogsError(e?.message ?? String(e))
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [publicClient, address])

  const betContracts = betLogs.map((b) => ({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: ABI,
    functionName: 'bets' as const,
    args: [b.betId] as const,
  }))
  const { data: betResults } = useReadContracts({
    contracts: betContracts,
    query: { enabled: betLogs.length > 0 },
  })

  const marketContracts = betLogs.map((b) => ({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: ABI,
    functionName: 'markets' as const,
    args: [b.marketId] as const,
  }))
  const { data: marketResults } = useReadContracts({
    contracts: marketContracts,
    query: { enabled: betLogs.length > 0 },
  })

  // The `claimed` flag on the bet struct flips true after claimWinnings() —
  // the first of a 3-step flow — so it goes true before the payout actually
  // lands. betWithdrawn() only flips once withdraw() completes, which is what
  // "already claimed" should mean to the user (matches PlaceBetCard's claim tab).
  const withdrawnContracts = betLogs.map((b) => ({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: ABI,
    functionName: 'betWithdrawn' as const,
    args: [b.betId] as const,
  }))
  const { data: withdrawnResults } = useReadContracts({
    contracts: withdrawnContracts,
    query: { enabled: betLogs.length > 0 },
  })

  // Each bet's choice is FHE-encrypted; only the bettor's own permit can decrypt it,
  // so we decrypt client-side per bet, same pattern as PlaceBetCard's claim tab.
  const [decryptedChoices, setDecryptedChoices] = useState<Record<string, boolean>>({})
  const [decryptingIds, setDecryptingIds] = useState<Set<string>>(new Set())
  const betIdsKey = betLogs.map((b) => b.betId.toString()).join(',')

  useEffect(() => {
    if (!cofheReady || !betResults || betLogs.length === 0) return
    betLogs.forEach((b, i) => {
      const key = b.betId.toString()
      if (decryptedChoices[key] !== undefined || decryptingIds.has(key)) return
      const result = betResults[i]
      if (result?.status !== 'success') return
      const [, encChoice] = result.result as BetTuple

      setDecryptingIds((prev) => new Set(prev).add(key))
      cofheClient
        .decryptForView(BigInt(encChoice), FheTypes.Bool)
        .withPermit()
        .execute()
        .then((choice) => {
          setDecryptedChoices((prev) => ({ ...prev, [key]: choice as boolean }))
        })
        .catch(() => {
          // leave undecrypted — row shows a lock icon instead of a result
        })
        .finally(() => {
          setDecryptingIds((prev) => {
            const next = new Set(prev)
            next.delete(key)
            return next
          })
        })
    })
    // re-run only when the bet set, results, or readiness changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cofheReady, betResults, betIdsKey])

  const rows: MyBetRow[] = betLogs.map((b, i) => {
    const betResult = betResults?.[i]
    const marketResult = marketResults?.[i]
    const withdrawnResult = withdrawnResults?.[i]

    const bet = betResult?.status === 'success' ? (betResult.result as BetTuple) : null
    const market = marketResult?.status === 'success' ? (marketResult.result as MarketTuple) : null
    const withdrawn = withdrawnResult?.status === 'success' ? (withdrawnResult.result as boolean) : false

    const key = b.betId.toString()

    return {
      betId: b.betId,
      marketId: b.marketId,
      question: market?.[0] ?? '',
      plainAmount: bet?.[2] ?? 0n,
      locked: market?.[2] ?? false,
      resolved: market?.[3] ?? false,
      outcome: market?.[4] ?? false,
      withdrawn,
      myChoice: decryptedChoices[key],
      isDecrypting: decryptingIds.has(key),
    }
  })

  return {
    rows,
    isConnected,
    loading: logsLoading || (betLogs.length > 0 && (!betResults || !marketResults)),
    error: logsError,
  }
}

interface MyBetsProps {
  handleClaimWinnings: (claimBetId: string, claimMarketId: string) => Promise<void>
  busy: boolean
  cofheReady: boolean
}

export function MyBets({ handleClaimWinnings, busy, cofheReady }: MyBetsProps) {
  const { rows, isConnected, loading, error } = useMyBets({ cofheReady })

  if (!isConnected) {
    return (
      <div className="confidential-card rounded-xl p-lg text-center py-xl">
        <span className="material-symbols-outlined text-on-surface-variant/30 block mb-sm" style={{ fontSize: 40 }}>
          account_balance_wallet
        </span>
        <p className="text-on-surface-variant font-body-sm text-body-sm">Connect your wallet to see your bets</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="confidential-card rounded-xl p-lg">
        <p className="text-error font-body-sm text-body-sm">Failed to load bets: {error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="confidential-card rounded-xl p-lg text-center py-xl">
        <span className="material-symbols-outlined text-on-surface-variant/50 animate-spin block mb-sm" style={{ fontSize: 32 }}>
          progress_activity
        </span>
        <p className="text-on-surface-variant font-body-sm text-body-sm">Loading your bets...</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="confidential-card rounded-xl p-lg text-center py-xl">
        <span className="material-symbols-outlined text-on-surface-variant/30 block mb-sm" style={{ fontSize: 40 }}>
          redeem
        </span>
        <p className="text-on-surface-variant font-body-sm text-body-sm">You haven't placed any bets yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-sm">
      {rows.map((row) => {
        const status = row.resolved ? 'RESOLVED' : row.locked ? 'LOCKED' : 'ACTIVE'
        const statusColor = row.resolved
          ? 'text-secondary'
          : row.locked
            ? 'text-amber-400'
            : 'text-tertiary'

        const isWinner =
          row.resolved && row.myChoice !== undefined ? row.myChoice === row.outcome : undefined
        const canClaim = row.resolved && isWinner === true && !row.withdrawn

        const claimLabel = row.withdrawn
          ? 'Already claimed'
          : busy
            ? 'Processing...'
            : !cofheReady
              ? 'FHE Init...'
              : 'Claim & Withdraw'

        return (
          <div
            key={row.betId.toString()}
            className="confidential-card rounded-xl p-md flex flex-col sm:flex-row sm:items-center justify-between gap-sm"
          >
            <div className="min-w-0 flex-1 space-y-[2px]">
              <div className="flex items-center gap-xs flex-wrap">
                <span className="font-code-md text-[11px] text-on-surface-variant">
                  Market #{row.marketId.toString()} · Bet #{row.betId.toString()}
                </span>
                <span className={`font-label-caps text-[10px] font-bold ${statusColor}`}>{status}</span>
              </div>
              <p className="font-body-sm text-sm text-on-surface truncate">
                {row.question || <span className="animate-pulse bg-surface-container-high rounded w-48 h-4 inline-block" />}
              </p>
              <div className="flex items-center gap-sm">
                <span className="font-code-md text-[11px] text-on-surface-variant">
                  {formatEther(row.plainAmount).slice(0, 6)} ETH
                </span>
                {row.myChoice !== undefined ? (
                  <span
                    className={`px-xs py-[1px] rounded text-[10px] font-bold font-label-caps ${
                      row.myChoice
                        ? 'bg-tertiary-container/30 text-tertiary'
                        : 'bg-secondary-container/30 text-secondary'
                    }`}
                  >
                    {row.myChoice ? 'YES' : 'NO'}
                  </span>
                ) : row.isDecrypting ? (
                  <span className="text-[10px] text-on-surface-variant animate-pulse">decrypting…</span>
                ) : (
                  <span className="material-symbols-outlined text-on-surface-variant/50" style={{ fontSize: 12 }}>
                    lock
                  </span>
                )}
                {row.resolved && isWinner !== undefined && (
                  <span
                    className={`font-label-caps text-[10px] font-bold ${
                      isWinner ? 'text-tertiary' : 'text-error'
                    }`}
                  >
                    {isWinner ? 'WON' : 'LOST'}
                  </span>
                )}
              </div>
            </div>

            {row.resolved && (
              <button
                className={`px-md py-xs rounded-xl font-bold text-xs flex items-center gap-xs transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${
                  row.withdrawn || isWinner !== true
                    ? 'bg-surface-container-high text-on-surface-variant/50'
                    : 'bg-tertiary-container text-on-tertiary-container hover:opacity-90'
                }`}
                onClick={() => handleClaimWinnings(row.betId.toString(), row.marketId.toString())}
                disabled={!canClaim || busy || !cofheReady}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {row.withdrawn ? 'check_circle' : isWinner === false ? 'close' : 'redeem'}
                </span>
                {row.withdrawn ? 'Already claimed' : isWinner === false ? 'You lost' : claimLabel}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

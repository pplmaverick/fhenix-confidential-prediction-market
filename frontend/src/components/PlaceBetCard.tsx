import { useState, useEffect } from 'react'
import { useAccount, useBalance, useReadContracts } from 'wagmi'
import { formatEther } from 'viem'
import { CONTRACT_ADDRESS, ABI } from '../contract'

interface PlaceBetCardProps {
  marketId: string
  handlePlaceBet: (
    marketId: string,
    betAmount: string,
    choice: 'yes' | 'no',
  ) => Promise<void>
  handleClaimWinnings: (
    claimBetId: string,
    claimMarketId: string,
  ) => Promise<void>
  cofheReady: boolean
  cofheStatus: string
  busy: boolean
  isConnected: boolean
  wrongChain: boolean
}

export function PlaceBetCard({
  marketId,
  handlePlaceBet,
  handleClaimWinnings,
  cofheReady,
  cofheStatus,
  busy,
  isConnected,
  wrongChain,
}: PlaceBetCardProps) {
  const [betAmount, setBetAmount] = useState('0.001')
  const [choice, setChoice] = useState<'yes' | 'no'>('yes')
  const [tab, setTab] = useState<'bet' | 'claim'>('bet')

  // reset bet amount on market switch to avoid stale values
  useEffect(() => {
    setBetAmount('0.001')
  }, [marketId])

  const { address } = useAccount()
  const { data: balance } = useBalance({ address })

  // fetch betId list for current market via marketBets(marketId, index) — the contract
  // has no length getter for the array, so we scan in growing windows until a slot
  // comes back empty (reverts), rather than capping at a fixed slot count.
  const PROBE_BATCH = 25
  const [probeWindow, setProbeWindow] = useState(PROBE_BATCH)

  // reset the scan window on market switch so a smaller market doesn't inherit a stale window
  useEffect(() => {
    setProbeWindow(PROBE_BATCH)
  }, [marketId])

  const marketBetContracts = Array.from({ length: probeWindow }, (_, i) => ({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: ABI,
    functionName: 'marketBets' as const,
    args: [BigInt(marketId || '0'), BigInt(i)] as const,
  }))
  const { data: marketBetResults, isLoading: betsLoading } = useReadContracts({
    contracts: marketBetContracts,
    query: { enabled: isConnected && tab === 'claim' },
  })

  // if every slot in the current window resolved, the array may extend further —
  // grow the window and probe again until a slot comes back empty
  useEffect(() => {
    if (!marketBetResults || marketBetResults.length === 0) return
    const allSucceeded = marketBetResults.every(r => r.status === 'success')
    if (allSucceeded) {
      setProbeWindow(w => w + PROBE_BATCH)
    }
  }, [marketBetResults])

  // successful results are valid betIds; failures are out-of-bounds slots
  const marketBetIds: bigint[] = marketBetResults
    ? marketBetResults
        .filter(r => r.status === 'success')
        .map(r => r.result as bigint)
    : []

  const balanceEth = balance ? parseFloat(formatEther(balance.value)) : null
  const GAS_RESERVE = 0.001 // reserve for gas
  const maxBet = balanceEth !== null ? Math.max(0, balanceEth - GAS_RESERVE) : null

  const canBet = isConnected && cofheReady && !wrongChain && !busy
  const canClaim = isConnected && cofheReady && !wrongChain && !busy

  const betBtnLabel = busy
    ? 'Processing...'
    : !isConnected
      ? 'Connect Wallet First'
      : wrongChain
        ? 'Switch to Arbitrum Sepolia'
        : !cofheReady
          ? 'Initialising FHE...'
          : 'Encrypt & Place Bet'

  return (
    <div className="confidential-card rounded-xl p-lg glow-accent">
      {/* Tab header */}
      <div className="flex items-center gap-md mb-lg border-b border-outline-variant pb-md">
        <button
          className={`font-label-caps text-xs pb-1 border-b-2 transition-colors ${
            tab === 'bet'
              ? 'text-on-surface border-primary'
              : 'text-on-surface-variant border-transparent hover:text-primary'
          }`}
          onClick={() => setTab('bet')}
        >
          Place Bet
        </button>
        <button
          className={`font-label-caps text-xs pb-1 border-b-2 transition-colors ${
            tab === 'claim'
              ? 'text-on-surface border-primary'
              : 'text-on-surface-variant border-transparent hover:text-primary'
          }`}
          onClick={() => setTab('claim')}
        >
          Claim Winnings
        </button>
        <div className="ml-auto flex items-center gap-xs bg-primary-container/10 border border-primary/20 px-sm py-[2px] rounded">
          <span
            className="material-symbols-outlined text-primary"
            style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}
          >
            enhanced_encryption
          </span>
          <span className="font-label-caps text-[10px] text-primary uppercase">
            Encrypted
          </span>
        </div>
      </div>

      {tab === 'bet' ? (
        <div className="space-y-lg">
          {/* Outcome Selection */}
          <div>
            <label className="font-label-caps text-[11px] text-on-surface-variant block mb-sm uppercase tracking-widest">
              Select Outcome
            </label>
            <div className="grid grid-cols-2 gap-sm">
              <button
                className={`py-md border-2 rounded-xl font-bold flex flex-col items-center gap-xs transition-all ${
                  choice === 'yes'
                    ? 'border-primary-container bg-primary-container/15 text-primary-fixed-dim'
                    : 'border-outline-variant text-on-surface-variant hover:border-primary/50 hover:text-primary-fixed-dim'
                }`}
                onClick={() => setChoice('yes')}
              >
                <span className="text-lg">YES</span>
                <span className="text-[10px] font-label-caps opacity-70">
                  Predict True
                </span>
              </button>
              <button
                className={`py-md border-2 rounded-xl font-bold flex flex-col items-center gap-xs transition-all ${
                  choice === 'no'
                    ? 'border-secondary-container bg-secondary-container/10 text-secondary'
                    : 'border-outline-variant text-on-surface-variant hover:border-secondary/50 hover:text-secondary'
                }`}
                onClick={() => setChoice('no')}
              >
                <span className="text-lg">NO</span>
                <span className="text-[10px] font-label-caps opacity-70">
                  Predict False
                </span>
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex justify-between items-center mb-sm">
              <label className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-widest">
                Bet Amount
              </label>
              {balanceEth !== null && (
                <span className="font-code-md text-[11px] text-on-surface-variant">
                  Balance: <span className="text-on-surface">{balanceEth.toFixed(4)}</span> ETH
                </span>
              )}
            </div>
            <div className="relative">
              <input
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-md pl-md pr-16 text-on-surface font-code-md text-code-md focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none transition-all"
                placeholder="0.001"
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                min="0.001"
                step="0.001"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="font-label-caps text-sm font-bold text-on-surface-variant">
                  ETH
                </span>
              </div>
            </div>
            <div className="flex justify-between mt-xs px-1">
              <button
                className="text-[10px] font-label-caps text-primary hover:underline"
                onClick={() => setBetAmount('0.001')}
              >
                MIN (0.001)
              </button>
              {maxBet !== null && maxBet > 0.001 && (
                <button
                  className="text-[10px] font-label-caps text-secondary hover:underline"
                  onClick={() => setBetAmount(maxBet.toFixed(4))}
                >
                  MAX ({maxBet.toFixed(4)})
                </button>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-surface-container-low rounded-xl p-md border border-outline-variant/30 space-y-sm">
            <div className="flex justify-between items-center">
              <span className="font-label-caps text-[11px] text-on-surface-variant">
                Market ID
              </span>
              <span className="font-code-md text-code-md text-on-surface">
                #{marketId}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-label-caps text-[11px] text-on-surface-variant">
                Amount
              </span>
              <span className="font-code-md text-code-md font-bold text-on-surface">
                {betAmount || '—'} ETH
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-label-caps text-[11px] text-on-surface-variant">
                Choice
              </span>
              <span
                className={`font-code-md text-code-md font-bold ${
                  choice === 'yes' ? 'text-tertiary' : 'text-secondary'
                }`}
              >
                {choice.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-label-caps text-[11px] text-on-surface-variant">
                Privacy
              </span>
              <span className="font-code-md text-[11px] text-tertiary flex items-center gap-xs">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 13, fontVariationSettings: "'FILL' 1" }}
                >
                  lock
                </span>
                FHE Encrypted
              </span>
            </div>
          </div>

          {/* FHE status indicator */}
          {isConnected && (
            <div
              className={`flex items-start gap-sm px-md py-sm rounded-xl border text-xs font-label-caps ${
                wrongChain
                  ? 'bg-error-container/20 border-error/30 text-error'
                  : cofheStatus === 'error'
                    ? 'bg-error-container/20 border-error/30 text-error'
                    : cofheReady
                      ? 'bg-tertiary-container/10 border-tertiary/30 text-on-tertiary-container'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 mt-[2px] ${
                  wrongChain
                    ? 'bg-error'
                    : cofheStatus === 'error'
                      ? 'bg-error'
                      : cofheReady
                        ? 'bg-tertiary'
                        : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span>
                {wrongChain && 'Please switch to Arbitrum Sepolia in MetaMask to initialize CoFHE'}
                {!wrongChain && cofheReady && cofheStatus !== 'signing' && 'CoFHE Ready — bets are encrypted'}
                {!wrongChain && cofheReady && cofheStatus === 'signing' && (
                  <>
                    CoFHE Ready — bets are encrypted
                    <br />
                    <span className="opacity-70 normal-case font-normal">
                      Background: requesting FHE permit (optional)
                    </span>
                  </>
                )}
                {!wrongChain && !cofheReady && cofheStatus === 'connecting' && 'Connecting to CoFHE network...'}
                {!wrongChain && !cofheReady && cofheStatus === 'error' && 'CoFHE initialization failed, please refresh the page'}
                {!wrongChain && !cofheReady && !cofheStatus && 'Initialising CoFHE client...'}
              </span>
            </div>
          )}

          {/* Submit Button */}
          <button
            className="w-full bg-primary-container text-white py-md rounded-xl font-bold text-sm flex items-center justify-center gap-sm glow-submit transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => handlePlaceBet(marketId, betAmount, choice)}
            disabled={!canBet}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1", fontSize: 20 }}
            >
              security
            </span>
            {betBtnLabel}
          </button>
        </div>
      ) : (
        /* Claim Winnings Tab */
        <div className="space-y-md">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            After market settlement, your unclaimed bets in <span className="text-primary font-bold">Market #{marketId}</span> will be listed automatically.
          </p>

          {!isConnected ? (
            <p className="text-on-surface-variant text-sm text-center py-lg">Please connect your wallet first</p>
          ) : betsLoading ? (
            <div className="text-center py-lg">
              <span className="material-symbols-outlined text-on-surface-variant/50 animate-spin block mb-sm" style={{ fontSize: 32 }}>progress_activity</span>
              <p className="text-on-surface-variant font-body-sm text-body-sm">Loading bets...</p>
            </div>
          ) : marketBetIds.length === 0 ? (
            <div className="text-center py-lg border border-outline-variant/30 rounded-xl">
              <span className="material-symbols-outlined text-on-surface-variant/30 block mb-sm" style={{ fontSize: 40 }}>redeem</span>
              <p className="text-on-surface-variant font-body-sm text-body-sm">No bets in this market</p>
            </div>
          ) : (
            <div className="space-y-sm">
              {marketBetIds.map((betId) => (
                <div key={betId.toString()} className="flex items-center justify-between px-md py-sm rounded-xl border border-outline-variant bg-surface-container/30">
                  <div className="space-y-[2px]">
                    <p className="font-code-md text-code-md text-on-surface">Bet #{betId.toString()}</p>
                    <p className="font-code-md text-[11px] text-on-surface-variant">Market #{marketId}</p>
                  </div>
                  <button
                    className="bg-tertiary-container text-on-tertiary-container px-md py-xs rounded-xl font-bold text-xs flex items-center gap-xs transition-all active:scale-95 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => handleClaimWinnings(betId.toString(), marketId)}
                    disabled={!canClaim}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>redeem</span>
                    {busy ? 'Processing...' : !cofheReady ? 'FHE Init...' : 'Claim & Withdraw'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

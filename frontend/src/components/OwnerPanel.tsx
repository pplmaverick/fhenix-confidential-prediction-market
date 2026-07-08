import { useState } from 'react'
import { useAccount, usePublicClient, useWalletClient, useReadContract } from 'wagmi'
import { formatEther, parseEventLogs } from 'viem'
import { arbitrumSepolia } from 'wagmi/chains'
import { cofheClient } from '../cofheClient'
import { estimateGasFees } from '../gas'
import { CONTRACT_ADDRESS, ABI } from '../contract'

interface OwnerPanelProps {
  marketId: string
  owner: `0x${string}` | undefined
  marketStatus: 'OPEN' | 'LOCKED' | 'RESOLVED'
  addLog: (msg: string) => void
  refetchMarket: () => void
}

type BusyAction = 'lock' | 'submitResult' | 'reveal' | 'submitWinnerPool' | 'settleNoWinners' | null

export function OwnerPanel({ marketId, owner, marketStatus, addLog, refetchMarket }: OwnerPanelProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // Case-insensitive compare — checksum casing can differ between sources
  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase()

  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [outcome, setOutcome] = useState(true) // true = Yes wins, false = No wins
  const [decryptedWinnerPool, setDecryptedWinnerPool] = useState<{
    value: bigint
    ctHash: bigint
    signature: `0x${string}`
  } | null>(null)

  const { data: encWinnerPoolOnChain, refetch: refetchEncWinnerPool } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'encWinnerPools',
    args: [BigInt(marketId || '0')],
    query: { enabled: isOwner },
  })
  const isRevealed = !!encWinnerPoolOnChain && BigInt(encWinnerPoolOnChain as `0x${string}`) !== 0n

  const { data: winnerPoolOnChain, refetch: refetchWinnerPool } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'winnerPools',
    args: [BigInt(marketId || '0')],
    query: { enabled: isOwner },
  })
  const isWinnerPoolSet = !!winnerPoolOnChain && (winnerPoolOnChain as bigint) > 0n

  const { data: isNoWinnersSettled, refetch: refetchNoWinnersSettled } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'noWinnersMarket',
    args: [BigInt(marketId || '0')],
    query: { enabled: isOwner },
  })

  // Owner-only — render nothing at all for anyone else
  if (!isOwner) return null

  const busy = busyAction !== null

  async function handleLockMarket() {
    if (!walletClient || !publicClient) return
    setBusyAction('lock')
    try {
      addLog(`[Owner] lockMarket(marketId=${marketId})...`)
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'lockMarket',
        args: [BigInt(marketId)],
        chain: arbitrumSepolia,
        account: walletClient.account!,
        gas: 500_000n,
        ...(await estimateGasFees(publicClient)),
      })
      addLog(`lockMarket tx: ${hash}`)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') {
        addLog(`❌ lockMarket reverted — view: https://sepolia.arbiscan.io/tx/${hash}`)
        return
      }
      addLog('✅ Market locked')
      refetchMarket()
    } catch (e: any) {
      addLog(`Error: ${e.message ?? String(e)}`)
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSubmitResult() {
    if (!walletClient || !publicClient) return
    setBusyAction('submitResult')
    try {
      addLog(`[Owner] submitResult(marketId=${marketId}, outcome=${outcome ? 'Yes' : 'No'})...`)
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'submitResult',
        args: [BigInt(marketId), outcome],
        chain: arbitrumSepolia,
        account: walletClient.account!,
        gas: 500_000n,
        ...(await estimateGasFees(publicClient)),
      })
      addLog(`submitResult tx: ${hash}`)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') {
        addLog(`❌ submitResult reverted — view: https://sepolia.arbiscan.io/tx/${hash}`)
        return
      }
      addLog(`✅ Result submitted: ${outcome ? 'Yes' : 'No'} wins`)
      refetchMarket()
    } catch (e: any) {
      addLog(`Error: ${e.message ?? String(e)}`)
    } finally {
      setBusyAction(null)
    }
  }

  async function handleRevealWinnerPool() {
    if (!walletClient || !publicClient) return
    setBusyAction('reveal')
    try {
      let encWinnerPoolCtHash: bigint

      if (isRevealed && encWinnerPoolOnChain) {
        // Already revealed in an earlier session — re-decrypt instead of
        // re-calling revealWinnerPool (which would revert: "Already revealed")
        encWinnerPoolCtHash = BigInt(encWinnerPoolOnChain as `0x${string}`)
        addLog(
          `Winner pool already revealed on-chain — re-fetching decrypted value. ` +
          `ctHash: 0x${encWinnerPoolCtHash.toString(16).slice(0, 16)}...`
        )
      } else {
        addLog(`[Owner] revealWinnerPool(marketId=${marketId})...`)
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'revealWinnerPool',
          args: [BigInt(marketId)],
          chain: arbitrumSepolia,
          account: walletClient.account!,
          gas: 5_000_000n,
          ...(await estimateGasFees(publicClient)),
        })
        addLog(`revealWinnerPool tx: ${hash}`)
        addLog('Waiting for on-chain confirmation...')
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status === 'reverted') {
          addLog(`❌ revealWinnerPool reverted — view: https://sepolia.arbiscan.io/tx/${hash}`)
          return
        }
        const revealLogs = parseEventLogs({ abi: ABI, eventName: 'WinnerPoolRevealed', logs: receipt.logs })
        if (revealLogs.length === 0) {
          addLog('⚠️ WinnerPoolRevealed event not found')
          return
        }
        encWinnerPoolCtHash = BigInt(
          (revealLogs[0].args as { encWinnerPoolCtHash: `0x${string}` }).encWinnerPoolCtHash
        )
        addLog(`revealWinnerPool ✓ — ctHash: 0x${encWinnerPoolCtHash.toString(16).slice(0, 16)}...`)
        refetchEncWinnerPool()
      }

      addLog('CoFHE network decrypting (20-60s)...')
      const wpDecrypt = await cofheClient.decryptForTx(encWinnerPoolCtHash).withoutPermit().execute()
      const plainWinnerPool = wpDecrypt.decryptedValue
      setDecryptedWinnerPool({
        value: plainWinnerPool,
        ctHash: BigInt(wpDecrypt.ctHash.toString()),
        signature: wpDecrypt.signature,
      })
      addLog(
        `Winner pool decrypted: ${formatEther(plainWinnerPool)} ETH` +
        (plainWinnerPool === 0n ? ' (no winners — use Settle No Winners)' : '')
      )
    } catch (e: any) {
      addLog(`Error: ${e.message ?? String(e)}`)
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSubmitWinnerPool() {
    if (!walletClient || !publicClient || !decryptedWinnerPool) return
    setBusyAction('submitWinnerPool')
    try {
      addLog(
        `[Owner] submitWinnerPool(marketId=${marketId}, ` +
        `winnerPool=${formatEther(decryptedWinnerPool.value)} ETH)...`
      )
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'submitWinnerPool',
        args: [
          BigInt(marketId),
          decryptedWinnerPool.value,
          decryptedWinnerPool.ctHash,
          decryptedWinnerPool.signature,
        ],
        chain: arbitrumSepolia,
        account: walletClient.account!,
        gas: 500_000n,
        ...(await estimateGasFees(publicClient)),
      })
      addLog(`submitWinnerPool tx: ${hash}`)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') {
        addLog(`❌ submitWinnerPool reverted — view: https://sepolia.arbiscan.io/tx/${hash}`)
        return
      }
      addLog(`✅ Winner pool set: ${formatEther(decryptedWinnerPool.value)} ETH`)
      refetchWinnerPool()
      refetchMarket()
    } catch (e: any) {
      addLog(`Error: ${e.message ?? String(e)}`)
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSettleNoWinners() {
    if (!walletClient || !publicClient || !decryptedWinnerPool) return
    setBusyAction('settleNoWinners')
    try {
      addLog(`[Owner] settleNoWinners(marketId=${marketId})...`)
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'settleNoWinners',
        args: [BigInt(marketId), decryptedWinnerPool.ctHash, decryptedWinnerPool.signature],
        chain: arbitrumSepolia,
        account: walletClient.account!,
        gas: 500_000n,
        ...(await estimateGasFees(publicClient)),
      })
      addLog(`settleNoWinners tx: ${hash}`)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status === 'reverted') {
        addLog(`❌ settleNoWinners reverted — view: https://sepolia.arbiscan.io/tx/${hash}`)
        return
      }
      addLog('✅ Market settled as no-winners — bettors can now claim refunds via withdrawRefund')
      refetchNoWinnersSettled()
      refetchMarket()
    } catch (e: any) {
      addLog(`Error: ${e.message ?? String(e)}`)
    } finally {
      setBusyAction(null)
    }
  }

  const canLock = marketStatus === 'OPEN'
  const canSubmitResult = marketStatus === 'LOCKED'
  const canReveal = marketStatus === 'RESOLVED' && !isWinnerPoolSet && !isNoWinnersSettled
  const canSubmitWinnerPool =
    !!decryptedWinnerPool && decryptedWinnerPool.value > 0n && !isWinnerPoolSet && !isNoWinnersSettled
  const canSettleNoWinners =
    !!decryptedWinnerPool && decryptedWinnerPool.value === 0n && !isNoWinnersSettled

  const btnBase =
    'w-full py-sm rounded-lg font-bold text-xs flex items-center justify-center gap-xs transition-all ' +
    'active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed border border-amber-500/60 ' +
    'text-amber-400 hover:bg-amber-500/10'

  return (
    <div className="mt-lg border-2 border-amber-500/50 rounded-xl p-lg bg-amber-500/5">
      <div className="flex items-center gap-xs mb-md">
        <span className="material-symbols-outlined text-amber-400" style={{ fontSize: 18 }}>
          admin_panel_settings
        </span>
        <h3 className="font-headline-lg-mobile text-sm font-bold text-amber-400 uppercase tracking-wide">
          Owner Controls
        </h3>
      </div>

      <div className="space-y-sm">
        <button className={btnBase} onClick={handleLockMarket} disabled={!canLock || busy}>
          {busyAction === 'lock' ? 'Locking...' : 'Lock Market'}
        </button>

        <div className="flex gap-sm items-center">
          <div className="flex rounded-lg border border-amber-500/60 overflow-hidden flex-shrink-0">
            <button
              className={`px-md py-xs text-xs font-bold transition-colors ${
                outcome ? 'bg-amber-500 text-black' : 'text-amber-400 hover:bg-amber-500/10'
              }`}
              onClick={() => setOutcome(true)}
              disabled={!canSubmitResult || busy}
            >
              YES
            </button>
            <button
              className={`px-md py-xs text-xs font-bold transition-colors ${
                !outcome ? 'bg-amber-500 text-black' : 'text-amber-400 hover:bg-amber-500/10'
              }`}
              onClick={() => setOutcome(false)}
              disabled={!canSubmitResult || busy}
            >
              NO
            </button>
          </div>
          <button className={`${btnBase} flex-1`} onClick={handleSubmitResult} disabled={!canSubmitResult || busy}>
            {busyAction === 'submitResult' ? 'Submitting...' : 'Submit Result'}
          </button>
        </div>

        <button className={btnBase} onClick={handleRevealWinnerPool} disabled={!canReveal || busy}>
          {busyAction === 'reveal' ? 'Revealing...' : 'Reveal Winner Pool'}
        </button>

        {decryptedWinnerPool && !isWinnerPoolSet && !isNoWinnersSettled && (
          <p className="text-[11px] text-amber-400/80 text-center">
            Decrypted winner pool: {formatEther(decryptedWinnerPool.value)} ETH
          </p>
        )}

        <button
          className={btnBase}
          onClick={handleSubmitWinnerPool}
          disabled={!canSubmitWinnerPool || busy}
        >
          {busyAction === 'submitWinnerPool' ? 'Submitting...' : 'Submit Winner Pool'}
        </button>

        <button
          className={btnBase}
          onClick={handleSettleNoWinners}
          disabled={!canSettleNoWinners || busy}
        >
          {busyAction === 'settleNoWinners' ? 'Settling...' : 'Settle No Winners'}
        </button>
      </div>
    </div>
  )
}

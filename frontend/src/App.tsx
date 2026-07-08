import { useState, useEffect, useCallback } from 'react'
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useReadContract,
  useChainId,
} from 'wagmi'
import { parseEther, parseEventLogs, formatEther } from 'viem'
import { arbitrumSepolia } from 'wagmi/chains'
import { Encryptable } from '@cofhe/sdk'
import { cofheClient } from './cofheClient'
import { estimateGasFees } from './gas'
import { CONTRACT_ADDRESS, ABI, CHAIN_ID } from './contract'
import { Navbar } from './components/Navbar'
import { MarketCard } from './components/MarketCard'
import { MarketSelector } from './components/MarketSelector'
import { PlaceBetCard } from './components/PlaceBetCard'
import { ActivityLog } from './components/ActivityLog'
import { CreateMarketCard } from './components/CreateMarketCard'

type LogEntry = { time: string; msg: string }

function timestamp() {
  return new Date().toLocaleTimeString()
}

export default function App() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [cofheReady, setCofheReady] = useState(false)
  const [cofheStatus, setCofheStatus] = useState('')
  const [marketId, setMarketId] = useState('0')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, { time: timestamp(), msg }])
  }, [])

  // Connect CoFHE client when wallet is ready
  useEffect(() => {
    if (!isConnected || !publicClient || !walletClient) {
      setCofheReady(false)
      setCofheStatus('')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setCofheStatus('connecting')
        addLog('CoFHE: Initializing...')

        await Promise.race([
          cofheClient.connect(publicClient as any, walletClient as any),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('cofheClient.connect() timeout (10s)')), 10000)
          ),
        ])

        if (!cancelled) {
          setCofheReady(true)
          setCofheStatus('ready')
          addLog('CoFHE client ready ✓')
        }

        // permit runs in background; failure does not block betting
        if (!cancelled) {
          try {
            setCofheStatus('signing')
            await cofheClient.permits.getOrCreateSelfPermit()
            if (!cancelled) {
              setCofheStatus('ready')
              addLog('FHE permit ready ✓')
            }
          } catch (permitErr: any) {
            if (!cancelled) {
              setCofheStatus('ready')
              addLog(`FHE permit (skipped): ${permitErr.message}`)
            }
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setCofheStatus('error')
          addLog(`CoFHE error: ${e.message}`)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isConnected, publicClient, walletClient, addLog])

  const { data: marketData, refetch: refetchMarket } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'markets',
    args: [BigInt(marketId || '0')],
  })

  const { data: nextMarketId, refetch: refetchNextMarketId } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'nextMarketId',
  })

  const { data: nextBetId } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'nextBetId',
  })

  const wrongChain = isConnected && chainId !== CHAIN_ID

  async function handlePlaceBet(
    marketIdParam: string,
    betAmount: string,
    choice: 'yes' | 'no',
  ) {
    if (!walletClient || !cofheReady) return
    setBusy(true)
    try {
      addLog(
        `Encrypting bet: amount=${betAmount} ETH, choice=${choice.toUpperCase()}`,
      )
      const amountWei = parseEther(betAmount)

      // Only the choice is encrypted client-side; the stake amount is bound to
      // msg.value on-chain by the contract (see Fix #1: encAmount/msg.value binding)
      const [encChoice] = await cofheClient
        .encryptInputs([Encryptable.bool(choice === 'yes')])
        .execute()

      // Explicitly convert to viem tuple format, ensuring signature has 0x prefix
      const toStruct = (enc: any) => ({
        ctHash: BigInt(enc.ctHash),
        securityZone: Number(enc.securityZone),
        utype: Number(enc.utype),
        signature: (typeof enc.signature === 'string' && !enc.signature.startsWith('0x')
          ? `0x${enc.signature}`
          : enc.signature) as `0x${string}`,
      })
      const encChoiceStruct = toStruct(encChoice)

      addLog(`enc ctHash: ${encChoiceStruct.ctHash.toString().slice(0, 16)}… sig: ${encChoiceStruct.signature.slice(0, 10)}…`)
      addLog('Sending placeBet tx...')

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'placeBet',
        args: [BigInt(marketIdParam), encChoiceStruct],
        value: amountWei,
        chain: arbitrumSepolia,
        account: walletClient.account!,
        gas: 5_000_000n,
        ...(await estimateGasFees(publicClient!)),
      })

      addLog(`placeBet tx sent: ${hash}`)
    } catch (e: any) {
      addLog(`Error: ${e.message ?? String(e)}`)
    } finally {
      setBusy(false)
      refetchMarket()
    }
  }

  async function handleClaimWinnings(
    claimBetId: string,
    claimMarketId: string,
  ) {
    if (!walletClient || !cofheReady) return
    setBusy(true)
    try {
      // ── Pre-check A: winner pool ─────────────────────────────────────
      let winnerPool = 0n
      try {
        winnerPool = await publicClient!.readContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'winnerPools',
          args: [BigInt(claimMarketId)],
        }) as bigint
      } catch { /* treat as not set */ }

      if (winnerPool === 0n) {
        // ── Step W1: revealWinnerPool — FHE sum of winning bets ────────
        addLog(`[W1] revealWinnerPool(marketId=${claimMarketId}) — computing winner pool via FHE...`)
        const revealHash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'revealWinnerPool',
          args: [BigInt(claimMarketId)],
          chain: arbitrumSepolia,
          account: walletClient.account!,
          gas: 5_000_000n,
          ...(await estimateGasFees(publicClient!)),
        })
        addLog(`revealWinnerPool tx: ${revealHash}`)
        addLog('Waiting for on-chain confirmation...')
        const revealReceipt = await publicClient!.waitForTransactionReceipt({ hash: revealHash })

        if (revealReceipt.status === 'reverted') {
          addLog(`❌ revealWinnerPool reverted — view: https://sepolia.arbiscan.io/tx/${revealHash}`)
          return
        }

        const revealLogs = parseEventLogs({ abi: ABI, eventName: 'WinnerPoolRevealed', logs: revealReceipt.logs })
        if (revealLogs.length === 0) {
          addLog('⚠️ WinnerPoolRevealed event not found')
          return
        }
        const encWinnerPoolCtHash = BigInt(
          (revealLogs[0].args as { encWinnerPoolCtHash: `0x${string}` }).encWinnerPoolCtHash
        )
        addLog(`revealWinnerPool ✓ — ctHash: 0x${encWinnerPoolCtHash.toString(16).slice(0, 16)}...`)

        // ── Step W2: decrypt winner pool ───────────────────────────────
        addLog('[W2] CoFHE network decrypting (20-60s)...')
        const wpDecrypt = await cofheClient.decryptForTx(encWinnerPoolCtHash).withoutPermit().execute()
        const plainWinnerPool = wpDecrypt.decryptedValue
        addLog(`Winner pool decrypted: ${formatEther(plainWinnerPool)} ETH`)

        // ── Step W3: submitWinnerPool — store plaintext on-chain ───────
        addLog(`[W3] submitWinnerPool(marketId=${claimMarketId})...`)
        const submitHash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'submitWinnerPool',
          args: [
            BigInt(claimMarketId),
            plainWinnerPool,
            BigInt(wpDecrypt.ctHash.toString()),
            wpDecrypt.signature,
          ],
          chain: arbitrumSepolia,
          account: walletClient.account!,
          gas: 500_000n,
          ...(await estimateGasFees(publicClient!)),
        })
        addLog(`submitWinnerPool tx: ${submitHash}`)
        await publicClient!.waitForTransactionReceipt({ hash: submitHash })
        winnerPool = plainWinnerPool
        addLog(`✓ Winner pool set: ${formatEther(winnerPool)} ETH`)
      } else {
        addLog(`Winner pool: ${formatEther(winnerPool)} ETH (already set)`)
      }

      // ── Pre-check B: pendingPayouts[betId] already set? ─────────────
      // euint64 is bytes32; non-zero means claimWinnings has already run
      let ctHashForDecrypt: bigint

      let storedCtHash: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000'
      try {
        storedCtHash = await publicClient!.readContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'pendingPayouts',
          args: [BigInt(claimBetId)],
        }) as `0x${string}`
      } catch {
        // treat read failure as not-yet-set and proceed to claimWinnings
      }

      const alreadyClaimed = BigInt(storedCtHash) !== 0n

      if (alreadyClaimed) {
        addLog(`pendingPayouts ctHash already set, skipping claimWinnings`)
        ctHashForDecrypt = BigInt(storedCtHash)
      } else {
        // ── Step 1: claimWinnings — FHE on-chain compute ─────────────
        addLog(`[1/3] claimWinnings(betId=${claimBetId}, marketId=${claimMarketId})...`)
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'claimWinnings',
          args: [BigInt(claimBetId), BigInt(claimMarketId)],
          chain: arbitrumSepolia,
          account: walletClient.account!,
          gas: 5_000_000n,
          ...(await estimateGasFees(publicClient!)),
        })
        addLog(`claimWinnings tx: ${hash}`)
        addLog('Waiting for on-chain confirmation...')
        const receipt = await publicClient!.waitForTransactionReceipt({ hash })

        if (receipt.status === 'reverted') {
          addLog(`❌ claimWinnings reverted — view: https://sepolia.arbiscan.io/tx/${hash}`)
          return
        }

        const claimLogs = parseEventLogs({ abi: ABI, eventName: 'WinningsClaimed', logs: receipt.logs })
        if (claimLogs.length === 0) {
          addLog('⚠️ WinningsClaimed event not found — this bet may not be eligible for claiming')
          return
        }
        const encPayoutCtHashBytes32 = (claimLogs[0].args as { encPayoutCtHash: `0x${string}` }).encPayoutCtHash
        ctHashForDecrypt = BigInt(encPayoutCtHashBytes32)
        addLog(`claimWinnings ✓ — ctHash: ${encPayoutCtHashBytes32.slice(0, 18)}...`)
      }

      // ── Step 2: Decrypt via CoFHE threshold network ────────────────
      const step2Label = alreadyClaimed ? '[1/2]' : '[2/3]'
      addLog(`${step2Label} CoFHE network decrypting (20-60s)...`)
      const decryptResult = await cofheClient.decryptForTx(ctHashForDecrypt).withoutPermit().execute()
      const plainBetAmount = decryptResult.decryptedValue
      if (plainBetAmount === 0n) {
        addLog('⚠️ Decryption result is 0 ETH (losing bet, no payout)')
        return
      }

      // Compute proportional payout client-side for display
      const totalPool = BigInt((marketData as any)?.[5] ?? 0n)
      const proportionalPayout = totalPool > 0n && winnerPool > 0n
        ? (plainBetAmount * totalPool) / winnerPool
        : plainBetAmount
      const payoutEth = formatEther(proportionalPayout)
      addLog(`Decryption complete. Bet = ${formatEther(plainBetAmount)} ETH → proportional payout = ${payoutEth} ETH`)

      // ── Step 3: withdraw — proportional ETH transfer ───────────────
      const step3Label = alreadyClaimed ? '[2/2]' : '[3/3]'
      addLog(`${step3Label} withdraw(betId=${claimBetId}, marketId=${claimMarketId})...`)
      const withdrawHash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'withdraw',
        args: [
          BigInt(claimBetId),
          BigInt(claimMarketId),
          plainBetAmount,
          BigInt(decryptResult.ctHash.toString()),
          decryptResult.signature,
        ],
        chain: arbitrumSepolia,
        account: walletClient.account!,
        gas: 500_000n,
        ...(await estimateGasFees(publicClient!)),
      })
      addLog(`withdraw tx: ${withdrawHash}`)
      await publicClient!.waitForTransactionReceipt({ hash: withdrawHash })
      addLog(`✅ Withdrawal successful! Received ${payoutEth} ETH`)
    } catch (e: any) {
      addLog(`Error: ${e.message ?? String(e)}`)
    } finally {
      setBusy(false)
      refetchMarket()
    }
  }

  return (
    <div className="dark min-h-screen flex flex-col bg-background text-on-surface">
      <Navbar cofheReady={cofheReady} />

      <main className="flex-grow w-full max-w-container-max mx-auto px-gutter py-xl">

        {/* Market Selector — always visible, no wallet required */}
        <div className="mb-xl">
          <div className="flex items-center justify-between mb-md">
            <h3 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">
              All Markets
            </h3>
            <div className="flex items-center gap-md">
              <span className="font-code-md text-[11px] text-on-surface-variant">
                {nextMarketId?.toString() ?? '0'} markets
              </span>
              <button
                onClick={() => setShowCreateForm((v) => !v)}
                className={`flex items-center gap-xs px-md py-xs rounded-lg text-[12px] font-bold border transition-all duration-200 ${
                  showCreateForm
                    ? 'border-outline-variant text-on-surface-variant hover:border-primary/50 hover:text-on-surface'
                    : 'border-primary text-primary hover:bg-primary/10'
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                  {showCreateForm ? 'close' : 'add'}
                </span>
                {showCreateForm ? 'Cancel' : 'Create Market'}
              </button>
            </div>
          </div>

          {/* Collapsible Create Market form */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              showCreateForm ? 'max-h-[520px] opacity-100 mb-md' : 'max-h-0 opacity-0'
            }`}
          >
            <CreateMarketCard
              addLog={addLog}
              isConnected={isConnected}
              onMarketCreated={() => {
                refetchNextMarketId()
                setShowCreateForm(false)
              }}
            />
          </div>

          <div className="confidential-card rounded-xl p-md">
            <MarketSelector
              marketCount={Number(nextMarketId ?? 0n)}
              selectedId={marketId}
              onSelect={(id) => { setMarketId(id); refetchMarket() }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-lg items-start">
          {/* Left: Market Info */}
          <div className="lg:col-span-7">
            <MarketCard
              marketId={marketId}
              setMarketId={setMarketId}
              marketData={
                marketData as
                  | readonly [
                      string,
                      `0x${string}`,
                      boolean,
                      boolean,
                      boolean,
                      bigint,
                    ]
                  | undefined
              }
              nextMarketId={nextMarketId as bigint | undefined}
              nextBetId={nextBetId as bigint | undefined}
              refetchMarket={refetchMarket}
            />
          </div>

          {/* Right: Place Bet */}
          <div className="lg:col-span-5 flex flex-col gap-lg">
            <PlaceBetCard
              marketId={marketId}
              handlePlaceBet={handlePlaceBet}
              handleClaimWinnings={handleClaimWinnings}
              cofheReady={cofheReady}
              cofheStatus={cofheStatus}
              busy={busy}
              isConnected={isConnected}
              wrongChain={wrongChain}
            />
          </div>
        </div>

        {/* Activity Log */}
        <div id="activity-log">
          <ActivityLog logs={logs} onClear={() => setLogs([])} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-outline-variant/30 py-lg mt-xl">
        <div className="max-w-container-max mx-auto px-gutter flex flex-col sm:flex-row justify-between items-center gap-sm">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            © 2024 Fhenix Confidential Prediction Market. Built on FHE.
          </p>
          <div className="flex gap-md">
            <a
              href="https://cofhe-docs.fhenix.zone"
              target="_blank"
              rel="noreferrer"
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors"
            >
              Docs
            </a>
            <a
              href={`https://sepolia.arbiscan.io/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors"
            >
              Contract
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

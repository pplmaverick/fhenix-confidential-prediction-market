import { useState, useEffect, useCallback } from 'react'
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useReadContract,
  useChainId,
} from 'wagmi'
import { parseEther, parseGwei, parseEventLogs, formatEther } from 'viem'
import { arbitrumSepolia } from 'wagmi/chains'
import { Encryptable } from '@cofhe/sdk'
import { cofheClient } from './cofheClient'
import { CONTRACT_ADDRESS, ABI, CHAIN_ID } from './contract'
import { Navbar } from './components/Navbar'
import { MarketCard } from './components/MarketCard'
import { MarketSelector } from './components/MarketSelector'
import { PlaceBetCard } from './components/PlaceBetCard'
import { ActivityLog } from './components/ActivityLog'

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
        addLog('CoFHE: 初始化中...')

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

        // permit 背景執行，失敗不影響下注
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
              addLog(`FHE permit (略過): ${permitErr.message}`)
            }
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setCofheStatus('error')
          addLog(`CoFHE 錯誤: ${e.message}`)
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
    query: { enabled: isConnected },
  })

  const { data: nextMarketId } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'nextMarketId',
    query: { enabled: isConnected },
  })

  const { data: nextBetId } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'nextBetId',
    query: { enabled: isConnected },
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

      const [encAmount, encChoice] = await cofheClient
        .encryptInputs([
          Encryptable.uint64(amountWei),
          Encryptable.bool(choice === 'yes'),
        ])
        .execute()

      // 明確轉換為 viem tuple 格式，確保 signature 有 0x 前綴
      const toStruct = (enc: any) => ({
        ctHash: BigInt(enc.ctHash),
        securityZone: Number(enc.securityZone),
        utype: Number(enc.utype),
        signature: (typeof enc.signature === 'string' && !enc.signature.startsWith('0x')
          ? `0x${enc.signature}`
          : enc.signature) as `0x${string}`,
      })
      const encAmountStruct = toStruct(encAmount)
      const encChoiceStruct = toStruct(encChoice)

      addLog(`enc ctHash: ${encAmountStruct.ctHash.toString().slice(0, 16)}… sig: ${encAmountStruct.signature.slice(0, 10)}…`)
      addLog('Sending placeBet tx...')

      const feeData = await publicClient!.estimateFeesPerGas()
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'placeBet',
        args: [BigInt(marketIdParam), encAmountStruct, encChoiceStruct],
        value: amountWei,
        chain: arbitrumSepolia,
        account: walletClient.account!,
        gas: 5_000_000n,
        maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 2n : parseGwei('0.1'),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? parseGwei('0.001'),
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
      // ── Pre-check: pendingPayouts[betId] 是否已設定 ─────────────────
      // euint64 is bytes32，若非 0x000...0 代表 claimWinnings 已執行過
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
        // 讀取失敗就當作尚未設定，繼續呼叫 claimWinnings
      }

      const alreadyClaimed = BigInt(storedCtHash) !== 0n

      if (alreadyClaimed) {
        addLog(`pendingPayouts 已有 ctHash，跳過 claimWinnings`)
        ctHashForDecrypt = BigInt(storedCtHash)
      } else {
        // ── Step 1: claimWinnings — FHE on-chain compute ─────────────
        addLog(`[1/3] claimWinnings(betId=${claimBetId}, marketId=${claimMarketId})...`)
        const claimFee = await publicClient!.estimateFeesPerGas()
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'claimWinnings',
          args: [BigInt(claimBetId), BigInt(claimMarketId)],
          chain: arbitrumSepolia,
          account: walletClient.account!,
          gas: 5_000_000n,
          maxFeePerGas: claimFee.maxFeePerGas ? claimFee.maxFeePerGas * 2n : parseGwei('0.1'),
          maxPriorityFeePerGas: claimFee.maxPriorityFeePerGas ?? parseGwei('0.001'),
        })
        addLog(`claimWinnings tx: ${hash}`)
        addLog('等待鏈上確認...')
        const receipt = await publicClient!.waitForTransactionReceipt({ hash })

        if (receipt.status === 'reverted') {
          addLog(`❌ claimWinnings reverted — 查看: https://sepolia.arbiscan.io/tx/${hash}`)
          return
        }

        // parse WinningsClaimed event from receipt logs
        const claimLogs = parseEventLogs({ abi: ABI, eventName: 'WinningsClaimed', logs: receipt.logs })
        if (claimLogs.length === 0) {
          addLog('⚠️ 找不到 WinningsClaimed event，可能此投注不符合領取條件')
          return
        }
        const encPayoutCtHashBytes32 = (claimLogs[0].args as { encPayoutCtHash: `0x${string}` }).encPayoutCtHash
        ctHashForDecrypt = BigInt(encPayoutCtHashBytes32)
        addLog(`claimWinnings ✓ — ctHash: ${encPayoutCtHashBytes32.slice(0, 18)}...`)
      }

      // ── Step 2: Decrypt via CoFHE threshold network ────────────────
      const step2Label = alreadyClaimed ? '[1/2]' : '[2/3]'
      addLog(`${step2Label} CoFHE network 解密中（約 20-60 秒）...`)
      const decryptResult = await cofheClient.decryptForTx(ctHashForDecrypt).withoutPermit().execute()
      const payoutWei = decryptResult.decryptedValue
      const payoutEth = formatEther(payoutWei)
      if (payoutWei === 0n) {
        addLog('⚠️ 解密結果為 0 ETH（此投注為虧損投注，無 payout）')
        return
      }
      addLog(`解密完成！Payout = ${payoutEth} ETH`)

      // ── Step 3: withdraw — actual ETH transfer ─────────────────────
      const step3Label = alreadyClaimed ? '[2/2]' : '[3/3]'
      addLog(`${step3Label} withdraw(betId=${claimBetId}, payout=${payoutEth} ETH)...`)
      const withdrawFee = await publicClient!.estimateFeesPerGas()
      const withdrawHash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'withdraw',
        args: [
          BigInt(claimBetId),
          payoutWei,
          BigInt(decryptResult.ctHash.toString()),
          decryptResult.signature,
        ],
        chain: arbitrumSepolia,
        account: walletClient.account!,
        gas: 500_000n,
        maxFeePerGas: withdrawFee.maxFeePerGas ? withdrawFee.maxFeePerGas * 2n : parseGwei('0.1'),
        maxPriorityFeePerGas: withdrawFee.maxPriorityFeePerGas ?? parseGwei('0.001'),
      })
      addLog(`withdraw tx: ${withdrawHash}`)
      await publicClient!.waitForTransactionReceipt({ hash: withdrawHash })
      addLog(`✅ 提款成功！收到 ${payoutEth} ETH`)
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

        {/* Market Selector */}
        {isConnected && (
          <div className="mb-xl">
            <div className="flex items-center justify-between mb-md">
              <h3 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">
                All Markets
              </h3>
              <span className="font-code-md text-[11px] text-on-surface-variant">
                {nextMarketId?.toString() ?? '0'} markets
              </span>
            </div>
            <div className="confidential-card rounded-xl p-md">
              <MarketSelector
                marketCount={Number(nextMarketId ?? 0n)}
                selectedId={marketId}
                onSelect={(id) => { setMarketId(id); refetchMarket() }}
              />
            </div>
          </div>
        )}

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
          <div className="lg:col-span-5">
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

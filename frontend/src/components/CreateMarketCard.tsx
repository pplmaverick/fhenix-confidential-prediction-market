import { useState } from 'react'
import { useWalletClient, usePublicClient } from 'wagmi'
import { parseGwei, parseEventLogs } from 'viem'
import { arbitrumSepolia } from 'wagmi/chains'
import { FACTORY_ADDRESS, FACTORY_ABI } from '../contract'

interface CreateMarketCardProps {
  addLog: (msg: string) => void
  isConnected: boolean
  onMarketCreated?: () => void
}

export function CreateMarketCard({ addLog, isConnected, onMarketCreated }: CreateMarketCardProps) {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState('YES, NO')
  const [endTime, setEndTime] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    if (!walletClient || !publicClient || !question.trim()) return
    setBusy(true)
    try {
      const optionsList = options.split(',').map((o) => o.trim()).filter(Boolean)
      const endTimestamp = endTime
        ? BigInt(Math.floor(new Date(endTime).getTime() / 1000))
        : BigInt(Math.floor(Date.now() / 1000) + 86400)

      addLog(`Creating market: "${question}"...`)

      const feeData = await publicClient.estimateFeesPerGas()
      const hash = await walletClient.writeContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'createMarket',
        args: [question.trim(), optionsList, endTimestamp],
        chain: arbitrumSepolia,
        account: walletClient.account!,
        maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 2n : parseGwei('0.1'),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? parseGwei('0.001'),
      })

      addLog(`createMarket tx: ${hash}`)
      addLog('Waiting for on-chain confirmation...')

      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      if (receipt.status === 'reverted') {
        addLog(`❌ createMarket reverted — view: https://sepolia.arbiscan.io/tx/${hash}`)
        return
      }

      const eventLogs = parseEventLogs({
        abi: FACTORY_ABI,
        eventName: 'MarketCreated',
        logs: receipt.logs,
      })

      if (eventLogs.length > 0) {
        const marketAddr = (eventLogs[0].args as { market: `0x${string}` }).market
        addLog(`✅ Market created at ${marketAddr}`)
      }

      setQuestion('')
      setEndTime('')
      onMarketCreated?.()
    } catch (e: any) {
      addLog(`Error: ${e.message ?? String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const canCreate = isConnected && !busy && question.trim().length > 0

  return (
    <div className="confidential-card rounded-xl p-lg">
      <div className="flex items-center gap-sm mb-lg border-b border-outline-variant pb-md">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}
        >
          add_circle
        </span>
        <h3 className="font-headline-lg-mobile text-base font-bold text-on-surface">
          Create Market
        </h3>
        <span className="ml-auto font-label-caps text-[10px] text-on-surface-variant border border-outline-variant rounded px-sm py-[2px]">
          MarketFactory
        </span>
      </div>

      <div className="space-y-md">
        {/* Question */}
        <div>
          <label className="font-label-caps text-[11px] text-on-surface-variant block mb-xs uppercase tracking-widest">
            Question
          </label>
          <input
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-md px-md text-on-surface font-body-sm text-sm focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none transition-all"
            placeholder="Will ETH reach $5000 by end of 2025?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={busy}
          />
        </div>

        {/* Options */}
        <div>
          <label className="font-label-caps text-[11px] text-on-surface-variant block mb-xs uppercase tracking-widest">
            Options (comma-separated)
          </label>
          <input
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-md px-md text-on-surface font-body-sm text-sm focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none transition-all"
            placeholder="YES, NO"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            disabled={busy}
          />
        </div>

        {/* End Time */}
        <div>
          <label className="font-label-caps text-[11px] text-on-surface-variant block mb-xs uppercase tracking-widest">
            End Time (optional)
          </label>
          <input
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-md px-md text-on-surface font-body-sm text-sm focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none transition-all"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={busy}
          />
        </div>

        {/* Submit */}
        <button
          className="w-full bg-primary-container text-white py-md rounded-xl font-bold text-sm flex items-center justify-center gap-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleCreate}
          disabled={!canCreate}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'FILL' 1", fontSize: 18 }}
          >
            rocket_launch
          </span>
          {busy ? 'Deploying...' : !isConnected ? 'Connect Wallet First' : 'Deploy Market'}
        </button>
      </div>
    </div>
  )
}

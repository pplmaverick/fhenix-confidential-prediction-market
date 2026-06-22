import { useState, useEffect, useCallback } from 'react'
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWalletClient,
  useReadContract,
  useSwitchChain,
  useChainId,
} from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { arbitrumSepolia } from 'wagmi/chains'
import { Encryptable } from '@cofhe/sdk'
import { cofheClient } from './cofheClient'
import { CONTRACT_ADDRESS, ABI, CHAIN_ID } from './contract'

type LogEntry = { time: string; msg: string }

function timestamp() {
  return new Date().toLocaleTimeString()
}

export default function App() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [cofheReady, setCofheReady] = useState(false)
  const [marketId, setMarketId] = useState('0')
  const [betAmount, setBetAmount] = useState('0.001')
  const [choice, setChoice] = useState<'yes' | 'no'>('yes')
  const [claimBetId, setClaimBetId] = useState('0')
  const [claimMarketId, setClaimMarketId] = useState('0')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [busy, setBusy] = useState(false)

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, { time: timestamp(), msg }])
  }, [])

  // Connect CoFHE client when wallet is ready
  useEffect(() => {
    if (!isConnected || !publicClient || !walletClient) {
      setCofheReady(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        addLog('Initialising CoFHE client...')
        await cofheClient.connect(publicClient as any, walletClient as any)
        await cofheClient.permits.getOrCreateSelfPermit()
        if (!cancelled) {
          setCofheReady(true)
          addLog('CoFHE client ready')
        }
      } catch (e: any) {
        if (!cancelled) addLog(`CoFHE init error: ${e.message}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isConnected, publicClient, walletClient, addLog])

  // Read market info
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

  async function handlePlaceBet() {
    if (!walletClient || !cofheReady) return
    setBusy(true)
    try {
      addLog(`Encrypting bet: amount=${betAmount} ETH, choice=${choice.toUpperCase()}`)
      const amountWei = parseEther(betAmount)

      const [encAmount, encChoice] = await cofheClient
        .encryptInputs([
          Encryptable.uint64(amountWei),
          Encryptable.bool(choice === 'yes'),
        ])
        .execute()

      addLog('Encryption done. Sending placeBet tx...')

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'placeBet',
        args: [BigInt(marketId), encAmount as any, encChoice as any],
        value: amountWei,
        chain: arbitrumSepolia,
        account: walletClient.account!,
      })

      addLog(`placeBet tx sent: ${hash}`)
      addLog(`Arbiscan: https://sepolia.arbiscan.io/tx/${hash}`)
    } catch (e: any) {
      addLog(`Error: ${e.message ?? String(e)}`)
    } finally {
      setBusy(false)
      refetchMarket()
    }
  }

  async function handleClaimWinnings() {
    if (!walletClient) return
    setBusy(true)
    try {
      addLog(
        `Sending claimWinnings(betId=${claimBetId}, marketId=${claimMarketId})...`,
      )
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'claimWinnings',
        args: [BigInt(claimBetId), BigInt(claimMarketId)],
        chain: arbitrumSepolia,
        account: walletClient.account!,
      })
      addLog(`claimWinnings tx sent: ${hash}`)
      addLog(`Arbiscan: https://sepolia.arbiscan.io/tx/${hash}`)
    } catch (e: any) {
      addLog(`Error: ${e.message ?? String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const wrongChain = isConnected && chainId !== CHAIN_ID

  return (
    <div
      style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'monospace',
        color: '#eee',
        background: '#0d0d0d',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>
        Fhenix Confidential Prediction Market
      </h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
        Contract: <code>{CONTRACT_ADDRESS}</code> · Arbitrum Sepolia
      </p>

      {/* Wallet */}
      <section style={card}>
        <h2 style={sectionTitle}>Wallet</h2>
        {!isConnected ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {connectors.map((c) => (
              <button
                key={c.id}
                style={btn}
                onClick={() => connect({ connector: c })}
              >
                Connect {c.name}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <p style={{ margin: '0 0 8px' }}>
              Connected: <code style={{ fontSize: 11 }}>{address}</code>
            </p>
            {wrongChain && (
              <p style={{ color: '#e74', margin: '0 0 8px' }}>
                Wrong network — switch to Arbitrum Sepolia
                <button
                  style={{ ...btn, marginLeft: 8, padding: '4px 10px' }}
                  onClick={() => switchChain({ chainId: CHAIN_ID })}
                >
                  Switch
                </button>
              </p>
            )}
            <p style={{ margin: '0 0 8px', color: cofheReady ? '#4c4' : '#fa0' }}>
              CoFHE: {cofheReady ? '✓ Ready' : '⟳ Initialising...'}
            </p>
            <button
              style={{ ...btn, background: '#555' }}
              onClick={() => disconnect()}
            >
              Disconnect
            </button>
          </div>
        )}
      </section>

      {/* Market Info */}
      <section style={card}>
        <h2 style={sectionTitle}>Market Info</h2>
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 12,
            alignItems: 'center',
          }}
        >
          <label>Market ID:</label>
          <input
            style={inputStyle}
            value={marketId}
            onChange={(e) => setMarketId(e.target.value)}
            placeholder="0"
          />
          <button style={btn} onClick={() => refetchMarket()}>
            Refresh
          </button>
        </div>
        {marketData ? (
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <tbody>
              {(
                [
                  ['Question', marketData[0]],
                  ['Owner', marketData[1]],
                  ['Locked', String(marketData[2])],
                  ['Resolved', String(marketData[3])],
                  [
                    'Outcome',
                    marketData[3] ? (marketData[4] ? 'Yes' : 'No') : '—',
                  ],
                  ['Total Pool', formatEther(marketData[5]) + ' ETH'],
                ] as [string, string][]
              ).map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <td
                    style={{ padding: '4px 8px', color: '#aaa', width: 100 }}
                  >
                    {k}
                  </td>
                  <td
                    style={{
                      padding: '4px 8px',
                      wordBreak: 'break-all',
                      fontSize: 12,
                    }}
                  >
                    {v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#888', fontSize: 13 }}>
            {isConnected ? 'Loading...' : 'Connect wallet to view'}
          </p>
        )}
        <p style={{ fontSize: 12, color: '#888', marginTop: 8, marginBottom: 0 }}>
          Total markets: {nextMarketId?.toString() ?? '—'} · Total bets:{' '}
          {nextBetId?.toString() ?? '—'}
        </p>
      </section>

      {/* Place Bet */}
      <section style={card}>
        <h2 style={sectionTitle}>Place Bet (FHE Encrypted)</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ width: 110, flexShrink: 0 }}>Market ID:</label>
            <input
              style={inputStyle}
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
              placeholder="0"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ width: 110, flexShrink: 0 }}>Amount (ETH):</label>
            <input
              style={inputStyle}
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder="0.001"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ width: 110, flexShrink: 0 }}>Choice:</label>
            <button
              style={{
                ...btn,
                background: choice === 'yes' ? '#2a7' : '#333',
                border:
                  choice === 'yes' ? '1px solid #4c9' : '1px solid #555',
              }}
              onClick={() => setChoice('yes')}
            >
              Yes
            </button>
            <button
              style={{
                ...btn,
                background: choice === 'no' ? '#a33' : '#333',
                border:
                  choice === 'no' ? '1px solid #e66' : '1px solid #555',
              }}
              onClick={() => setChoice('no')}
            >
              No
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
            Amount and choice are FHE-encrypted via CoFHE before sending on-chain.
          </p>
          <button
            style={{
              ...btn,
              background: busy || !cofheReady || !isConnected ? '#555' : '#2a7',
              opacity: busy || !cofheReady || !isConnected ? 0.6 : 1,
            }}
            onClick={handlePlaceBet}
            disabled={busy || !isConnected || !cofheReady || wrongChain}
          >
            {busy ? 'Processing...' : 'Place Encrypted Bet'}
          </button>
        </div>
      </section>

      {/* Claim Winnings */}
      <section style={card}>
        <h2 style={sectionTitle}>Claim Winnings</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ width: 110, flexShrink: 0 }}>Bet ID:</label>
            <input
              style={inputStyle}
              value={claimBetId}
              onChange={(e) => setClaimBetId(e.target.value)}
              placeholder="0"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ width: 110, flexShrink: 0 }}>Market ID:</label>
            <input
              style={inputStyle}
              value={claimMarketId}
              onChange={(e) => setClaimMarketId(e.target.value)}
              placeholder="0"
            />
          </div>
          <button
            style={{
              ...btn,
              background: busy || !isConnected ? '#555' : '#8a4',
              opacity: busy || !isConnected ? 0.6 : 1,
            }}
            onClick={handleClaimWinnings}
            disabled={busy || !isConnected || wrongChain}
          >
            {busy ? 'Processing...' : 'Claim Winnings'}
          </button>
        </div>
      </section>

      {/* Activity Log */}
      <section style={card}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Activity Log</h2>
          <button
            style={{ ...btn, background: '#333', fontSize: 11, padding: '4px 10px' }}
            onClick={() => setLogs([])}
          >
            Clear
          </button>
        </div>
        <div
          style={{
            background: '#0a0a0a',
            borderRadius: 6,
            padding: 12,
            minHeight: 80,
            maxHeight: 220,
            overflowY: 'auto',
            border: '1px solid #222',
          }}
        >
          {logs.length === 0 ? (
            <p style={{ color: '#555', margin: 0, fontSize: 13 }}>
              No activity yet.
            </p>
          ) : (
            logs.map((l, i) => (
              <div key={i} style={{ fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: '#666' }}>[{l.time}]</span>{' '}
                <span style={{ color: '#ccc' }}>{l.msg}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

const card: React.CSSProperties = {
  background: '#161616',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  padding: 20,
  marginBottom: 16,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  marginBottom: 12,
  marginTop: 0,
  color: '#fff',
}

const btn: React.CSSProperties = {
  background: '#2a6',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'monospace',
}

const inputStyle: React.CSSProperties = {
  background: '#0d0d0d',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#fff',
  padding: '6px 10px',
  fontSize: 13,
  fontFamily: 'monospace',
  flex: 1,
}

interface LogEntry {
  time: string
  msg: string
}

interface ActivityLogProps {
  logs: LogEntry[]
  onClear: () => void
}

export function ActivityLog({ logs, onClear }: ActivityLogProps) {
  const txHashRegex = /0x[a-fA-F0-9]{64}/

  return (
    <section className="mt-xl">
      {/* Section header */}
      <div className="flex items-center justify-between mb-lg">
        <h3 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface flex items-center gap-sm">
          Activity Log
          <span className="material-symbols-outlined text-primary-fixed-dim">
            monitoring
          </span>
        </h3>
        <div className="flex items-center gap-md">
          <div className="text-on-surface-variant text-xs font-label-caps flex items-center gap-sm">
            <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
            Live
          </div>
          {logs.length > 0 && (
            <button
              className="font-label-caps text-[11px] text-on-surface-variant hover:text-error transition-colors"
              onClick={onClear}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="confidential-card rounded-xl overflow-hidden">
        {logs.length === 0 ? (
          <div className="px-lg py-xl text-center">
            <span
              className="material-symbols-outlined text-on-surface-variant/30 block mb-sm"
              style={{ fontSize: 48 }}
            >
              history
            </span>
            <p className="text-on-surface-variant font-body-sm text-body-sm">
              No activity yet. Connect wallet and place a bet to see logs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-outline-variant bg-surface-container/50">
                <tr>
                  <th className="px-lg py-md font-label-caps text-[11px] text-on-surface-variant uppercase tracking-widest">
                    Time
                  </th>
                  <th className="px-lg py-md font-label-caps text-[11px] text-on-surface-variant uppercase tracking-widest">
                    Activity
                  </th>
                  <th className="px-lg py-md font-label-caps text-[11px] text-on-surface-variant uppercase tracking-widest text-right">
                    Explorer
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {[...logs].reverse().map((log, i) => {
                  const txMatch = log.msg.match(txHashRegex)
                  const txHash = txMatch ? txMatch[0] : null

                  return (
                    <tr
                      key={i}
                      className="hover:bg-surface-container/40 transition-colors"
                    >
                      <td className="px-lg py-sm font-code-md text-code-md text-on-surface-variant whitespace-nowrap">
                        {log.time}
                      </td>
                      <td className="px-lg py-sm text-body-sm text-on-surface max-w-xs lg:max-w-none">
                        <span
                          className={
                            log.msg.startsWith('Error')
                              ? 'text-error'
                              : log.msg.startsWith('CoFHE client ready')
                                ? 'text-tertiary'
                                : log.msg.includes('tx sent')
                                  ? 'text-secondary'
                                  : 'text-on-surface'
                          }
                        >
                          {log.msg}
                        </span>
                      </td>
                      <td className="px-lg py-sm text-right">
                        {txHash && (
                          <a
                            href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-on-surface-variant hover:text-primary transition-colors inline-flex items-center gap-xs"
                            title="View on Arbiscan"
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: 16 }}
                            >
                              open_in_new
                            </span>
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

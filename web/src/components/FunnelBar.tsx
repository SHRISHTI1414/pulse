const ORDER: { key: string; userLabel: string; color: string; textColor: string }[] = [
  { key: 'queued',    userLabel: 'Waiting to send',    color: 'bg-espresso-200',  textColor: 'text-espresso-600' },
  { key: 'sent',      userLabel: 'Sent to carrier',    color: 'bg-blue-300',      textColor: 'text-blue-700' },
  { key: 'delivered', userLabel: 'Reached phone',      color: 'bg-blue-500',      textColor: 'text-blue-800' },
  { key: 'read',      userLabel: 'Customer read it',   color: 'bg-emerald-400',   textColor: 'text-emerald-800' },
  { key: 'clicked',   userLabel: 'Tapped the link',    color: 'bg-brand-500',     textColor: 'text-brand-800' },
  { key: 'failed',    userLabel: "Couldn't deliver",   color: 'bg-red-400',       textColor: 'text-red-700' },
]

export default function FunnelBar({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  if (total === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-espresso-400 bg-cream-50 rounded-xl border border-dashed border-espresso-200">
        No messages yet — send the campaign to see delivery stats here.
      </div>
    )
  }

  const segments = ORDER.filter(({ key }) => (byStatus[key] ?? 0) > 0)

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-4 w-full rounded-full overflow-hidden bg-espresso-100 shadow-inner">
        {segments.map(({ key, color, userLabel }) => {
          const n = byStatus[key] ?? 0
          const pct = (n / total) * 100
          return (
            <div
              key={key}
              className={`funnel-segment ${color} relative group`}
              style={{ width: `${pct}%` }}
              title={`${userLabel}: ${n.toLocaleString('en-IN')}`}
            />
          )
        })}
      </div>

      {/* Legend grid */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {segments.map(({ key, userLabel, color, textColor }) => {
          const n = byStatus[key] ?? 0
          const pct = ((n / total) * 100).toFixed(1)
          return (
            <div
              key={key}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-cream-50 border border-espresso-50"
            >
              <span className={`inline-block w-3 h-3 rounded-full ${color} shrink-0 shadow-sm`} />
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-semibold ${textColor}`}>{userLabel}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-espresso-900 tabular-nums">
                  {n.toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-espresso-400 tabular-nums">{pct}%</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

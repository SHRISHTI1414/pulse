// Stacked horizontal bar for the message-status funnel.
// Labels are user-friendly — internal status names ("queued", "sent") map
// to "Queued for delivery", "Sent to carrier", etc.

const ORDER: { key: string; label: string; userLabel: string; color: string }[] = [
  { key: 'queued',    label: 'Queued',    userLabel: 'Waiting to send',    color: 'bg-gray-300' },
  { key: 'sent',      label: 'Sent',      userLabel: 'Sent to carrier',    color: 'bg-blue-300' },
  { key: 'delivered', label: 'Delivered', userLabel: 'Reached phone',      color: 'bg-blue-500' },
  { key: 'read',      label: 'Read',      userLabel: 'Customer read it',   color: 'bg-emerald-500' },
  { key: 'clicked',   label: 'Clicked',   userLabel: 'Tapped the link',    color: 'bg-brand-600' },
  { key: 'failed',    label: 'Failed',    userLabel: 'Couldn’t deliver',   color: 'bg-red-400' },
]

export default function FunnelBar({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  if (total === 0) {
    return <div className="text-sm text-gray-400">No messages yet.</div>
  }
  return (
    <div>
      <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100">
        {ORDER.map(({ key, color, userLabel }) => {
          const n = byStatus[key] ?? 0
          if (n === 0) return null
          const pct = (n / total) * 100
          return (
            <div
              key={key}
              className={color}
              style={{ width: `${pct}%` }}
              title={`${userLabel}: ${n}`}
            />
          )
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
        {ORDER.map(({ key, userLabel, color }) => {
          const n = byStatus[key] ?? 0
          if (n === 0) return null
          const pct = ((n / total) * 100).toFixed(0)
          return (
            <div key={key} className="flex items-center gap-1.5 text-gray-700">
              <span className={`inline-block w-2.5 h-2.5 rounded-sm ${color} shrink-0`} />
              <span className="font-medium">{userLabel}</span>
              <span className="text-gray-500 ml-auto tabular-nums">
                {n.toLocaleString('en-IN')} <span className="text-gray-400">({pct}%)</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

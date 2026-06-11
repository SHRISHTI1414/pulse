// Stacked horizontal bar for the message-status funnel.
// Order matches the state machine: queued < sent < delivered < read < clicked; failed off-path.

const ORDER: { key: string; label: string; color: string }[] = [
  { key: 'queued',    label: 'Queued',    color: 'bg-gray-300' },
  { key: 'sent',      label: 'Sent',      color: 'bg-blue-300' },
  { key: 'delivered', label: 'Delivered', color: 'bg-blue-500' },
  { key: 'read',      label: 'Read',      color: 'bg-emerald-500' },
  { key: 'clicked',   label: 'Clicked',   color: 'bg-brand-600' },
  { key: 'failed',    label: 'Failed',    color: 'bg-red-400' },
]

export default function FunnelBar({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  if (total === 0) {
    return <div className="text-sm text-gray-400">No messages yet.</div>
  }
  return (
    <div>
      <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100">
        {ORDER.map(({ key, color }) => {
          const n = byStatus[key] ?? 0
          if (n === 0) return null
          const pct = (n / total) * 100
          return (
            <div
              key={key}
              className={color}
              style={{ width: `${pct}%` }}
              title={`${key}: ${n}`}
            />
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {ORDER.map(({ key, label, color }) => {
          const n = byStatus[key] ?? 0
          if (n === 0) return null
          return (
            <div key={key} className="flex items-center gap-1.5 text-gray-700">
              <span className={`inline-block w-2.5 h-2.5 rounded-sm ${color}`} />
              <span className="font-medium">{label}</span>
              <span className="text-gray-500">{n.toLocaleString('en-IN')}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

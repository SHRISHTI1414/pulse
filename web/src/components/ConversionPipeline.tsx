// Visual funnel with drop-off % between steps — turns raw numbers into a story.

interface Step {
  value: number
  label: string
  sub: string
  color: string
}

function pct(from: number, to: number): string {
  if (from === 0) return '—'
  return `${((to / from) * 100).toFixed(0)}%`
}

export default function ConversionPipeline({ steps }: { steps: Step[] }) {
  return (
    <div className="space-y-0">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null
        const dropPct = prev != null ? pct(prev, s.value) : null
        const widthPct = steps[0].value > 0 ? Math.max(8, (s.value / steps[0].value) * 100) : 8

        return (
          <div key={i}>
            {dropPct != null && (
              <div className="flex items-center gap-2 py-2 pl-4">
                <div className="w-px h-4 bg-espresso-200" />
                <span className="text-[11px] font-semibold text-espresso-400 tabular-nums">
                  {dropPct} converted from {steps[i - 1].label.toLowerCase()}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-espresso-300">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="w-24 shrink-0 text-right">
                <div className="font-display text-xl font-semibold text-espresso-900 tabular-nums">
                  {s.value.toLocaleString('en-IN')}
                </div>
                <div className="text-xs font-semibold text-espresso-600">{s.label}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`h-10 rounded-xl ${s.color} flex items-center px-4 transition-all duration-700 shadow-sm`}
                  style={{ width: `${widthPct}%`, minWidth: '3rem' }}
                >
                  <span className="text-xs font-medium text-white/90 truncate">{s.sub}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

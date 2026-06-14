// Visual gauge for how likely a cohort is to come back — makes prioritisation obvious.

export type RecoveryLevel = 'high' | 'medium' | 'low'

const CONFIG: Record<RecoveryLevel, { label: string; score: number; color: string; bg: string; hint: string }> = {
  high: {
    label: 'High recovery odds',
    score: 85,
    color: 'bg-emerald-500',
    bg: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    hint: 'Strong past habit — worth acting on first',
  },
  medium: {
    label: 'Medium recovery odds',
    score: 55,
    color: 'bg-amber-400',
    bg: 'bg-amber-50 border-amber-100 text-amber-800',
    hint: 'Still active but fading — a nudge can help',
  },
  low: {
    label: 'Low recovery odds',
    score: 25,
    color: 'bg-espresso-300',
    bg: 'bg-espresso-50 border-espresso-100 text-espresso-600',
    hint: 'One-time buyers — lower ROI, deprioritise',
  },
}

export function recoveryLevelFromRef(ref: string | undefined | null): RecoveryLevel {
  if (ref === 'lapsed_regulars') return 'high'
  if (ref === 'delivery_drift') return 'medium'
  return 'low'
}

export default function RecoveryMeter({ level, compact = false }: { level: RecoveryLevel; compact?: boolean }) {
  const c = CONFIG[level]

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold ${c.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.color}`} />
        {c.label}
      </div>
    )
  }

  return (
    <div className={`rounded-xl border p-3 ${c.bg}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide">{c.label}</span>
        <span className="text-xs font-semibold tabular-nums">{c.score}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${c.color} transition-all duration-700`}
          style={{ width: `${c.score}%` }}
        />
      </div>
      <p className="text-[11px] mt-1.5 opacity-80">{c.hint}</p>
    </div>
  )
}

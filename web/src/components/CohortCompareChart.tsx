import type { Opportunity } from '../lib/types'
import { cohortMeta } from '../lib/cohort'

// Horizontal bar chart comparing cohort sizes — instant visual prioritisation.

function cohortValue(opp: Opportunity): number {
  const sizeFact = opp.facts.find((f) =>
    f.fact_id === 'f_lapsed_size' ||
    f.fact_id === 'f_drift_size' ||
    f.fact_id === 'f_festive_size',
  )
  if (sizeFact && typeof sizeFact.value === 'number') return sizeFact.value

  const valFact = opp.facts.find((f) => f.fact_id === 'f_lapsed_annualized_value')
  if (valFact && typeof valFact.value === 'number') return valFact.value / 1000
  return 0
}

const BAR_COLORS: Record<string, string> = {
  lapsed_regulars: 'bg-brand-500',
  delivery_drift: 'bg-amber-400',
  festive_onetimers: 'bg-espresso-300',
}

export default function CohortCompareChart({ opps }: { opps: Opportunity[] }) {
  if (opps.length < 2) return null

  const items = opps.map((o) => {
    const ref = o.cohort_definition.cohort_ref
    const meta = cohortMeta(ref)
    return {
      opp: o,
      ref,
      label: meta?.shortLabel ?? 'Cohort',
      value: cohortValue(o),
      color: BAR_COLORS[ref] ?? 'bg-espresso-400',
    }
  }).sort((a, b) => b.value - a.value)

  const max = Math.max(...items.map((i) => i.value), 1)

  return (
    <div className="p-5 rounded-2xl bg-white border border-espresso-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-espresso-900">Cohort comparison</h3>
          <p className="text-xs text-espresso-400 mt-0.5">Relative size — taller bar = more customers or revenue at risk</p>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item) => {
          const w = (item.value / max) * 100
          const isMoney = item.ref === 'lapsed_regulars'
          const display = isMoney
            ? `₹${(item.value * 1000 / 100000).toFixed(1)}L at risk`
            : `${Math.round(item.value).toLocaleString('en-IN')} customers`

          return (
            <div key={item.opp.id} className="group">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-espresso-700">{item.label}</span>
                <span className="text-espresso-400 tabular-nums">{display}</span>
              </div>
              <div className="h-7 rounded-lg bg-cream-100 overflow-hidden">
                <div
                  className={`h-full rounded-lg ${item.color} transition-all duration-700 flex items-center px-2`}
                  style={{ width: `${Math.max(w, 4)}%` }}
                >
                  {w > 20 && (
                    <span className="text-[10px] font-bold text-white/90">P{item.opp.priority_rank}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

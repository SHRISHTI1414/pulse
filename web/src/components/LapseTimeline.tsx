// Visual timeline showing when customers went quiet — makes "lapsed" concrete.

export default function LapseTimeline({ cohortRef }: { cohortRef: string | undefined | null }) {
  const configs: Record<string, { events: { label: string; period: string; active: boolean }[] }> = {
    lapsed_regulars: {
      events: [
        { label: 'Weekly orders', period: 'Oct – Mar', active: false },
        { label: 'Still regular', period: 'Jan – Apr 20', active: false },
        { label: 'Went silent', period: 'After Apr 25', active: true },
        { label: 'Today', period: 'No orders', active: true },
      ],
    },
    delivery_drift: {
      events: [
        { label: 'Dine-in habit', period: '6+ months', active: false },
        { label: 'Shifted to delivery', period: 'Recent', active: false },
        { label: 'Ordering less', period: 'Last 60 days', active: true },
        { label: 'At risk', period: 'Now', active: true },
      ],
    },
    festive_onetimers: {
      events: [
        { label: 'Diwali promo', period: 'Oct – Nov', active: false },
        { label: '1–2 orders', period: 'Gift orders', active: false },
        { label: 'Went dormant', period: '180+ days', active: true },
        { label: 'Today', period: 'No return', active: true },
      ],
    },
  }

  const config = configs[cohortRef ?? ''] ?? configs.lapsed_regulars

  return (
    <div className="p-5 rounded-2xl bg-cream-50 border border-espresso-100">
      <h3 className="text-xs font-bold uppercase tracking-widest text-espresso-400 mb-4">
        What happened over time
      </h3>
      <div className="relative flex items-start justify-between gap-1">
        {/* Track line */}
        <div className="absolute top-3 left-3 right-3 h-0.5 bg-espresso-200" />

        {config.events.map((e, i) => (
          <div key={i} className="relative flex-1 flex flex-col items-center text-center z-10">
            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                e.active
                  ? 'bg-brand-500 border-brand-600 shadow-sm shadow-brand-500/30'
                  : 'bg-white border-espresso-200'
              }`}
            >
              {e.active ? (
                <span className="w-2 h-2 rounded-full bg-white live-dot" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-espresso-300" />
              )}
            </div>
            <div className={`mt-2 text-[10px] font-semibold leading-tight ${e.active ? 'text-brand-700' : 'text-espresso-500'}`}>
              {e.label}
            </div>
            <div className="text-[9px] text-espresso-400 mt-0.5">{e.period}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

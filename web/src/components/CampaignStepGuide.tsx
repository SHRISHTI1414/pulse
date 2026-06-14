// 3 mini-steps on the campaign screen so sending feels safe and obvious.

export default function CampaignStepGuide({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Edit message', desc: 'Tweak the text' },
    { n: 2, label: 'Preview', desc: 'Check the phone mockup' },
    { n: 3, label: 'Send', desc: 'Go live to customers' },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {steps.map((s) => {
        const done = s.n < current
        const active = s.n === current
        return (
          <div
            key={s.n}
            className={`px-3 py-2.5 rounded-xl border text-center transition-colors ${
              active
                ? 'bg-brand-50 border-brand-200'
                : done
                  ? 'bg-emerald-50/50 border-emerald-100'
                  : 'bg-white border-espresso-100'
            }`}
          >
            <div className={`text-[10px] font-bold uppercase tracking-wide ${
              active ? 'text-brand-600' : done ? 'text-emerald-600' : 'text-espresso-400'
            }`}>
              {done ? 'Done' : active ? 'Now' : `Step ${s.n}`}
            </div>
            <div className={`text-xs font-semibold mt-0.5 ${
              active ? 'text-espresso-900' : 'text-espresso-600'
            }`}>
              {s.label}
            </div>
            <div className="text-[10px] text-espresso-400 hidden sm:block">{s.desc}</div>
          </div>
        )
      })}
    </div>
  )
}

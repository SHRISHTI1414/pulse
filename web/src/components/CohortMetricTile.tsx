import type { ReactNode } from 'react'

const ICONS: Record<string, ReactNode> = {
  concentration: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  orders: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  revenue: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  customers: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  decline: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 18l-9.5-9.5-5 5L1 6" />
    </svg>
  ),
  delivery: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="3" width="15" height="13" rx="2" />
      <path d="M16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
    </svg>
  ),
  dormant: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  spend: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 12V8H6a2 2 0 010-4h7v4M4 6v12a2 2 0 002 2h14v-4M4 12h16" />
    </svg>
  ),
}

const EYEBROW_ICON: Record<string, keyof typeof ICONS> = {
  'Store concentration': 'concentration',
  'Orders before lapse': 'orders',
  'Annual revenue at risk': 'revenue',
  'Customers slipping': 'customers',
  'Frequency decline': 'decline',
  'Delivery share now': 'delivery',
  'Customers in cohort': 'customers',
  'Days dormant': 'dormant',
  'Average spend': 'spend',
}

function parsePct(value: string): number | null {
  const m = value.match(/^(\d+(?:\.\d+)?)\s*%$/)
  return m ? Math.min(100, parseFloat(m[1])) : null
}

export default function CohortMetricTile({
  eyebrow,
  value,
  explainer,
}: {
  eyebrow: string
  value: string
  explainer: string
}) {
  const iconKey = EYEBROW_ICON[eyebrow] ?? 'customers'
  const icon = ICONS[iconKey]
  const pct = parsePct(value)

  return (
    <div className="relative bg-white border border-espresso-100 rounded-2xl p-5 overflow-hidden group hover:border-brand-200 transition-colors">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-brand-50 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
            {icon}
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-espresso-400">
            {eyebrow}
          </div>
        </div>
        <div className="mt-3 font-display text-4xl font-semibold text-espresso-900 tabular-nums tracking-tight">
          {value}
        </div>
        {pct != null && (
          <div className="mt-3 h-2 rounded-full bg-cream-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <p className="mt-2 text-xs text-espresso-500 leading-relaxed">{explainer}</p>
      </div>
    </div>
  )
}

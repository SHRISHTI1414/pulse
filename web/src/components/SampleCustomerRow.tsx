import type { AudienceCustomer } from '../lib/types'

export default function SampleCustomerRow({ c, index }: { c: AudienceCustomer; index?: number }) {
  const store = c.home_store.replace(/^Brew Street\s+/, '')

  const orderFragment =
    c.pre_lapse_orders != null ? `${c.pre_lapse_orders} orders` : null
  const spendFragment =
    c.pre_lapse_monthly_spend != null
      ? `₹${Math.round(c.pre_lapse_monthly_spend).toLocaleString('en-IN')}/mo`
      : c.avg_lifetime_value != null
        ? `₹${Math.round(c.avg_lifetime_value).toLocaleString('en-IN')} lifetime`
        : null
  const dateFragment = c.last_order_at ? `last seen ${formatDate(c.last_order_at)}` : null

  const facts = [orderFragment, spendFragment, dateFragment].filter(Boolean) as string[]

  return (
    <div className="flex items-center gap-3 py-3.5 px-3 rounded-xl hover:bg-cream-50 transition-colors group">
      <span className="w-5 text-[11px] font-medium text-espresso-300 tabular-nums text-right shrink-0 hidden sm:block">
        {index != null ? index + 1 : ''}
      </span>
      <Avatar name={c.name} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-espresso-900 truncate group-hover:text-brand-700 transition-colors">
          {c.name}
        </div>
        <div className="text-xs text-espresso-400 flex items-center gap-1 mt-0.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          </svg>
          {store}
        </div>
      </div>
      <div className="text-right shrink-0">
        {spendFragment && (
          <div className="text-sm font-semibold text-espresso-800 tabular-nums">{spendFragment}</div>
        )}
        <div className="text-[11px] text-espresso-400 mt-0.5 hidden sm:block">
          {facts.filter((f) => f !== spendFragment).join(' · ')}
        </div>
      </div>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const hue = Array.from(name).reduce((a, c) => (a + c.charCodeAt(0)) % 360, 0)
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ring-2 ring-white shadow-sm"
      style={{ background: `hsl(${hue}, 42%, 48%)` }}
    >
      {initials || '·'}
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

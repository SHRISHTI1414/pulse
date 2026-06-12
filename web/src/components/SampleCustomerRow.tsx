// One row in the Cohort Detail "sample of the audience" table.
// Renders gracefully when some fields are null per cohort.

import type { AudienceCustomer } from '../lib/types'

export default function SampleCustomerRow({ c }: { c: AudienceCustomer }) {
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
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-b-0">
      <Avatar name={c.name} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
        <div className="text-xs text-gray-500">{store}</div>
      </div>
      <div className="text-xs text-gray-600 text-right whitespace-nowrap hidden sm:block">
        {facts.join(' · ')}
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
  // Deterministic hue per name for visual variety, fixed saturation/lightness.
  const hue = Array.from(name).reduce((a, c) => (a + c.charCodeAt(0)) % 360, 0)
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
      style={{ background: `hsl(${hue}, 45%, 50%)` }}
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

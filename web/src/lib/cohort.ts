// Plain-English labels + descriptions for the internal cohort_ref strings.
// Internal jargon ("lapsed_regulars") should never reach the UI.

export type CohortRef = 'lapsed_regulars' | 'delivery_drift' | 'festive_onetimers'

export interface CohortMeta {
  shortLabel: string
  title: string
  description: string
  accent: 'brand' | 'amber' | 'gray'
  /**
   * Three metric tiles shown on the Cohort Detail screen.
   * Each entry is the fact_id whose live value powers the tile + the
   * user-facing eyebrow + helper sentence below the value.
   */
  metricTiles: Array<{
    factId: string
    eyebrow: string
    explainer: string
    formatter?: (v: number) => string
  }>
}

const formatInr = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const formatLakhs = (v: number) => `₹${(v / 100000).toFixed(1)}L`
const formatPct = (v: number) => `${Math.round(v)}%`
const formatCount = (v: number) => v.toLocaleString('en-IN')

export const COHORT_META: Record<CohortRef, CohortMeta> = {
  lapsed_regulars: {
    shortLabel: 'Lapsed regulars',
    title: 'Daily regulars who stopped coming in',
    description:
      'Office-district customers who ordered weekly for months, then suddenly went silent in late April. Likely still working nearby — high recovery odds.',
    accent: 'brand',
    metricTiles: [
      {
        factId: 'f_lapsed_office_share_pct',
        eyebrow: 'Store concentration',
        explainer: 'in the 3 office-district outlets — Connaught Place, Cyber City, Noida Sec-18',
        formatter: formatPct,
      },
      {
        factId: 'f_lapsed_size',
        eyebrow: 'Orders before lapse',
        explainer: 'each customer had 12+ orders in the 6 months before April 25 — weekly regulars',
        formatter: formatCount,
      },
      {
        factId: 'f_lapsed_annualized_value',
        eyebrow: 'Annual revenue at risk',
        explainer: 'trailing-6-month spend, annualised — what stops coming in if they don\'t return',
        formatter: formatLakhs,
      },
    ],
  },
  delivery_drift: {
    shortLabel: 'Delivery drift',
    title: 'Dine-in regulars who quietly switched to delivery',
    description:
      'Used to come in for their morning order — now ordering delivery less often. Still active, but their habit is fading. Medium recovery odds.',
    accent: 'amber',
    metricTiles: [
      {
        factId: 'f_drift_size',
        eyebrow: 'Customers slipping',
        explainer: 'former dine-in regulars whose ordering is on a clear decline',
        formatter: formatCount,
      },
      {
        factId: 'f_drift_avg_freq_decay_pct',
        eyebrow: 'Frequency decline',
        explainer: 'how much less often they order now versus their long-run average',
        formatter: formatPct,
      },
      {
        factId: 'f_drift_avg_recent_delivery_pct',
        eyebrow: 'Delivery share now',
        explainer: 'fraction of their recent orders that come via delivery — was under 30% before',
        formatter: formatPct,
      },
    ],
  },
  festive_onetimers: {
    shortLabel: 'Festive one-timers',
    title: 'Diwali promo customers who never came back',
    description:
      'Acquired through last Diwali offers. Made 1–2 gift orders and went silent for over 6 months. Low recovery odds — a big cohort that drains spend.',
    accent: 'gray',
    metricTiles: [
      {
        factId: 'f_festive_size',
        eyebrow: 'Customers in cohort',
        explainer: 'Diwali-window acquisitions with 2 or fewer orders total',
        formatter: formatCount,
      },
      {
        factId: 'f_festive_pct_dormant_180d',
        eyebrow: 'Days dormant',
        explainer: '% of cohort with zero orders in the last 180 days — none have engaged since',
        formatter: formatPct,
      },
      {
        factId: 'f_festive_avg_lifetime_value',
        eyebrow: 'Average spend',
        explainer: 'lifetime spend per customer — promo-grade orders, not regular-rhythm spend',
        formatter: formatInr,
      },
    ],
  },
}

export function cohortMeta(ref: string | undefined | null): CohortMeta | null {
  if (!ref || !(ref in COHORT_META)) return null
  return COHORT_META[ref as CohortRef]
}

export const ACCENT_CLASSES: Record<CohortMeta['accent'], { badge: string; bar: string }> = {
  brand: {
    badge: 'bg-brand-50 text-brand-700 border-brand-100',
    bar: 'bg-brand-600',
  },
  amber: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    bar: 'bg-amber-500',
  },
  gray: {
    badge: 'bg-gray-100 text-gray-600 border-gray-200',
    bar: 'bg-gray-400',
  },
}

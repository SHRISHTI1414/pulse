// Plain-English labels + descriptions for the internal cohort_ref strings.
// Internal jargon ("lapsed_regulars") should never reach the UI.

export type CohortRef = 'lapsed_regulars' | 'delivery_drift' | 'festive_onetimers'

export interface CohortMeta {
  shortLabel: string
  title: string
  description: string
  accent: 'brand' | 'amber' | 'gray'
}

export const COHORT_META: Record<CohortRef, CohortMeta> = {
  lapsed_regulars: {
    shortLabel: 'Lapsed regulars',
    title: 'Daily regulars who stopped coming in',
    description:
      'Office-district customers who ordered weekly for months, then suddenly went silent in late April. Likely still working nearby — high recovery odds.',
    accent: 'brand',
  },
  delivery_drift: {
    shortLabel: 'Delivery drift',
    title: 'Dine-in regulars who quietly switched to delivery',
    description:
      'Used to come in for their morning order — now ordering delivery less often. Still active, but their habit is fading. Medium recovery odds.',
    accent: 'amber',
  },
  festive_onetimers: {
    shortLabel: 'Festive one-timers',
    title: 'Diwali promo customers who never came back',
    description:
      'Acquired through last Diwali offers. Made 1–2 gift orders and went silent for over 6 months. Low recovery odds — a big cohort that drains spend.',
    accent: 'gray',
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
